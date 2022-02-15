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
type AccessUserMap = Map<
  number,
  HeartbeatResponseData["accessManager"]["accessUsers"][number]
>;

const accessManagerSelect = Prisma.validator<Prisma.AccessManagerArgs>()({
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
});

// const accessUserSelect = (accessManagerId: number) => {
//   return Prisma.validator<Prisma.AccessUserArgs>()({
//     select: {
//       id: true,
//       name: true,
//       code: true,
//       activateCodeAt: true,
//       expireCodeAt: true,
//       accessPoints: {
//         select: { id: true, name: true },
//         where: { accessManager: { id: accessManagerId } },
//       },
//     },
//   });
// };

// type AccessUser = Prisma.AccessUserGetPayload<
//   ReturnType<typeof accessUserSelect>
// >;

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
      ...accessManagerSelect,
      rejectOnNotFound: true,
    });
    const accessEvents = accessManager.cloudLastAccessEventAt
      ? await db.accessEvent.findMany({
          where: {
            at: { gt: accessManager.cloudLastAccessEventAt },
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

    const addAccessUsers: HeartbeatResponseData["accessManager"]["accessUsers"][number][] =
      [];
    const commonIds = [];
    const cloudAccessUserMap: AccessUserMap = new Map();
    for (const accessUser of parseResult.data.accessManager.accessUsers) {
      cloudAccessUserMap.set(accessUser.id, accessUser);
      if (localAccessUserMap.has(accessUser.id)) {
        commonIds.push(accessUser.id);
      } else {
        addAccessUsers.push(accessUser);
      }
    }

    if (
      cloudAccessUserMap.size !==
      parseResult.data.accessManager.accessUsers.length
    ) {
      throw new Error(`Duplicate cloud access user id's.`);
    }

    const commonIdsSet = new Set(commonIds);
    const removeIds = [...localAccessUserMap.keys()].filter(
      (x) => !commonIdsSet.has(x)
    );

    // TODO: compare access point id's only in sets.
    const modifyIds = commonIds.filter(
      (id) => !_.isEqual(cloudAccessUserMap.get(id), localAccessUserMap.get(id))
    );

    // Delete first since codes must be unique.
    // const { count: deletedCount } = await db.accessUser.deleteMany({
    //   where: {
    //     id: { in: removeIds },
    //   },
    // });

    // TODO: Put in transaction, handle 2 users exchanging codes.
    /*
    for (const id of modifyIds) {
      const accessUser = cloudAccessUserMap.get(id);
      if (accessUser) {
        // eslint-disable-next-line no-await-in-loop
        await db.accessUser.update({
          where: { id: accessUser.id },
          data: {
            name: accessUser.name,
            code: accessUser.code,
            activateCodeAt: accessUser.activateCodeAt,
            expireCodeAt: accessUser.expireCodeAt,
            accessPoints: {
              set: accessUser.accessPoints.map((v) => ({ id: v.id })),
            },
          },
        });
      }
    }
*/
    // TODO: Put in transaction.
    // After delete and update since codes must be unique.
    /*
    for (const id of addAccessUsers) {
      const accessUser = cloudAccessUserMap.get(id);
      if (accessUser) {
        // eslint-disable-next-line no-await-in-loop
        await db.accessUser.create({
          data: {
            id: accessUser.id,
            name: accessUser.name,
            code: accessUser.code,
            activateCodeAt: accessUser.activateCodeAt,
            expireCodeAt: accessUser.expireCodeAt,
            accessPoints: {
              connect: accessUser.accessPoints.map((v) => ({ id: v.id })),
            },
            accessManagerId: accessManager.id,
          },
        });
      }
    }
*/
    const updatedAccessManager = await db.accessManager.update({
      where: { id: accessManager.id },
      data: {
        cloudLastAccessEventAt:
          parseResult.data.accessManager.cloudLastAccessEventAt,
        accessUsers: {
          deleteMany: {
            id: { in: removeIds },
          },
          create: addAccessUsers.map((accessUser) => ({
            ...accessUser,
            accessPoints: {
              connect: accessUser.accessPoints.map((v) => ({ id: v.id })),
            },
          })),
        },
      },
    });

    return {
      localAccessUserMap: [...localAccessUserMap],
      cloudAccessUserMap: [...cloudAccessUserMap],
      addAccessUsers,
      commonIds,
      removeIds,
      modifyIds,
      // deletedCount,
      cloudLastAccessEventAt:
        parseResult.data.accessManager.cloudLastAccessEventAt,
      updatedAccessManager,
    };
  }
}
