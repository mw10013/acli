/* eslint-disable no-warning-comments */
import { Command, Flags } from "@oclif/core";
import { Prisma, PrismaClient } from "@prisma/client";
import fetch from "node-fetch";
import { z } from "zod";
import * as _ from "lodash";

const accessEventSelect = Prisma.validator<Prisma.AccessEventArgs>()({
  select: {
    at: true,
    access: true,
    code: true,
    accessUserId: true,
    accessPointId: true,
  },
});
type AccessEvent = Prisma.AccessEventGetPayload<typeof accessEventSelect>;

type HeartbeatRequestData = {
  accessManager: {
    id: number;
    cloudLastAccessEventAt: string | null; // JSON date
    accessEvents: AccessEvent[];
  };
};

const HeartbeatResponseData = z.object({
  accessManager: z
    .object({
      id: z.number().int(),
      cloudLastAccessEventAt: z // JSON date
        .string()
        .min(1)
        .refine((v) => !Number.isNaN(Date.parse(v)), {
          message: "Invalid date time",
        })
        .transform((v) => new Date(v)),
      accessUsers: z.array(
        z
          .object({
            id: z.number().int(),
            name: z.string(),
            code: z.string().min(1),
            activateCodeAt: z // JSON date
              .string()
              .min(1)
              .nullable()
              .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
                message: "Invalid date time",
              })
              .transform((v) => (v ? new Date(v) : null)),
            expireCodeAt: z // JSON date
              .string()
              .min(1)
              .nullable()
              .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
                message: "Invalid date time",
              })
              .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
            accessPoints: z.array(
              z
                .object({
                  id: z.number().int(),
                  name: z.string(),
                })
                .strict()
            ),
          })
          .strict()
      ),
    })
    .strict(),
});
type HeartbeatResponseData = z.infer<typeof HeartbeatResponseData>;
type AccessUser = HeartbeatResponseData["accessManager"]["accessUsers"][number];
type AccessUserMap = Map<number, AccessUser>;

export default class Cmd extends Command {
  static description = "Post heartbeat to access cloud.";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {
    host: Flags.string({
      char: "h",
      description: "Heartbeat api host",
      default: "http://localhost:3000",
    }),
  };

  static args = [];

  async catch(error: Error): Promise<any> {
    // base class seems to swallow error
    throw error;
  }

  async run(): Promise<any> {
    const { flags } = await this.parse(Cmd);
    const db = new PrismaClient({ log: ["query"] });
    const accessManager = await db.accessManager.findFirst({
      select: {
        id: true,
        name: true,
        cloudLastAccessEventAt: true,
        accessPoints: {
          select: { id: true, name: true },
        },
        accessUsers: {
          select: {
            id: true,
            name: true,
            code: true,
            activateCodeAt: true,
            expireCodeAt: true,
            accessPoints: { select: { id: true, name: true } },
          },
        },
      },
      rejectOnNotFound: true,
    });
    const accessEvents = accessManager.cloudLastAccessEventAt
      ? await db.accessEvent.findMany({
          where: {
            AND: [
              { at: { gt: accessManager.cloudLastAccessEventAt } },
              { at: { lt: new Date(Date.now() - 5 * 1000) } }, // Leave margin before now to prevent race condition.
            ],
          },
          orderBy: { at: "desc" },
          ...accessEventSelect,
        })
      : [];
    const body: HeartbeatRequestData = {
      accessManager: {
        id: accessManager.id,
        cloudLastAccessEventAt: accessManager.cloudLastAccessEventAt
          ? accessManager.cloudLastAccessEventAt.toJSON()
          : null,
        accessEvents,
      },
    };
    const response = await fetch(`${flags.host}/api/accessmanager/heartbeat`, {
      method: "post",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      // this.error seems to swallow error text.
      throw new Error(
        `${response.status} ${response.statusText}: ${await response.text()}`
      );
    }

    const json = await response.json();
    const parseResult = HeartbeatResponseData.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Malformed response: ${parseResult.error.toString()}`);
    }

    const pointIds = new Set<number>(
      accessManager.accessPoints.map((i) => i.id)
    );
    const invalidPointIds = parseResult.data.accessManager.accessUsers.flatMap(
      (i) => i.accessPoints.map((c) => c.id).filter((i) => !pointIds.has(i))
    );
    if (invalidPointIds.length > 0) {
      throw new Error(
        `Invalid point ids in response: ${invalidPointIds.toString()}`
      );
    }

    const localAccessUserMap: AccessUserMap = new Map(
      accessManager.accessUsers.map((v) => [v.id, v])
    );

    const cloudAccessUserMap: AccessUserMap = new Map();
    const createAccessUsers: AccessUser[] = [];
    const updateAccessUsers: AccessUser[] = [];
    const commondIdsSet = new Set();
    const changedCodes = new Set();
    for (const cloudAccessUser of parseResult.data.accessManager.accessUsers) {
      cloudAccessUserMap.set(cloudAccessUser.id, cloudAccessUser);
      const localAccessUser = localAccessUserMap.get(cloudAccessUser.id);
      if (localAccessUser) {
        commondIdsSet.add(cloudAccessUser.id);
        if (
          !_.isEqual(
            {
              ...cloudAccessUser,
              accessPoints: new Set(
                cloudAccessUser.accessPoints.map((v) => v.id)
              ),
            },
            {
              ...localAccessUser,
              accessPoints: new Set(
                localAccessUser.accessPoints.map((v) => v.id)
              ),
            }
          )
        ) {
          updateAccessUsers.push(cloudAccessUser);
          if (cloudAccessUser.code !== localAccessUser.code) {
            changedCodes.add(cloudAccessUser.code);
          }
        }
      } else {
        createAccessUsers.push(cloudAccessUser);
      }
    }

    if (
      cloudAccessUserMap.size !==
      parseResult.data.accessManager.accessUsers.length
    ) {
      throw new Error(`Duplicate cloud access user id's.`);
    }

    const deleteIds = [...localAccessUserMap.keys()].filter(
      (x) => !commondIdsSet.has(x)
    );
    const recycledCodeLocalAccessUsers = updateAccessUsers
      .map((x) => localAccessUserMap.get(x.id))
      .filter((x): x is AccessUser => x !== undefined)
      .filter((x) => changedCodes.has(x.code));

    type TransactionParameter = Parameters<
      typeof db.$transaction
    >[number][number];

    // Access user codes must be unique: delete, update recyled codes, update, create.
    const transactionArray: TransactionParameter[] = [
      deleteIds.length === 0
        ? null
        : db.accessUser.deleteMany({
            where: {
              id: { in: deleteIds },
            },
          }),
      recycledCodeLocalAccessUsers.length === 0
        ? null
        : db.accessManager.update({
            where: { id: accessManager.id },
            data: {
              accessUsers: {
                update: recycledCodeLocalAccessUsers.map(({ id, code }) => ({
                  where: { id },
                  data: {
                    code: `${code}-`, // TODO: Robust way to make code unique.
                  },
                })),
              },
            },
          }),
      updateAccessUsers.length === 0
        ? null
        : db.accessManager.update({
            where: { id: accessManager.id },
            data: {
              accessUsers: {
                update: updateAccessUsers.map(({ id, ...accessUser }) => ({
                  where: { id },
                  data: {
                    ...accessUser,
                    accessPoints: {
                      set: accessUser.accessPoints.map((v) => ({ id: v.id })),
                    },
                  },
                })),
              },
            },
          }),
      createAccessUsers.length === 0
        ? null
        : db.accessManager.update({
            where: { id: accessManager.id },
            data: {
              accessUsers: {
                create: createAccessUsers.map((accessUser) => ({
                  ...accessUser,
                  accessPoints: {
                    connect: accessUser.accessPoints.map((v) => ({ id: v.id })),
                  },
                })),
              },
            },
          }),
      accessManager.cloudLastAccessEventAt &&
      accessManager.cloudLastAccessEventAt.getTime() ===
        parseResult.data.accessManager.cloudLastAccessEventAt.getTime()
        ? null
        : db.accessManager.update({
            where: { id: accessManager.id },
            data: {
              cloudLastAccessEventAt:
                parseResult.data.accessManager.cloudLastAccessEventAt,
            },
          }),
    ].filter((x): x is TransactionParameter => x !== null);
    await db.$transaction(transactionArray);

    return {
      localAccessUserMap: [...localAccessUserMap],
      cloudAccessUserMap: [...cloudAccessUserMap],
      accessEventCount: accessEvents.length,
      transactionArrayLength: transactionArray.length,
      commonIds: [...commondIdsSet],
      createIds: createAccessUsers.map((v) => v.id),
      updateIds: updateAccessUsers.map((v) => v.id),
      deleteIds,
      recycledCodeIds: recycledCodeLocalAccessUsers.map((x) => x.id),
    };
  }
}
