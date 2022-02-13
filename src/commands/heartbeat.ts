import { Command, Flags } from "@oclif/core";
import { Prisma, PrismaClient } from "@prisma/client";
import fetch from "node-fetch";
import { z } from "zod";

const HeartbeatResponseData = z.object({
  accessManager: z
    .object({
      id: z.number().int(),
      accessUsers: z.array(
        z
          .object({
            id: z.number().int(),
            name: z.string(),
            code: z.string().min(1),
            activateCodeAt: z // JSON date
              .string()
              .nullable()
              .refine(
                (v) => !v || v.length === 0 || !Number.isNaN(Date.parse(v)),
                {
                  message: "Invalid date time",
                }
              )
              .transform((v) => (v && v.length > 0 ? new Date(v) : null)),
            expireCodeAt: z // JSON date
              .string()
              .nullable()
              .refine(
                (v) => !v || v.length === 0 || !Number.isNaN(Date.parse(v)),
                {
                  message: "Invalid date time",
                }
              )
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
    accessPoints: {
      select: { id: true, name: true },
    },
  },
});
// type AccessManager = Prisma.AccessUserGetPayload<typeof accessManagerSelect>;

const accessUserSelect = (accessManagerId: number) => {
  return Prisma.validator<Prisma.AccessUserArgs>()({
    select: {
      id: true,
      name: true,
      code: true,
      activateCodeAt: true,
      expireCodeAt: true,
      accessPoints: {
        select: { id: true, name: true },
        where: { accessManager: { id: accessManagerId } },
      },
    },
  });
};

type AccessUser = Prisma.AccessUserGetPayload<
  ReturnType<typeof accessUserSelect>
>;

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
    const body = {
      accessManager: {
        id: 1,
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
    this.log(json);
    this.log(json.accessManager.accessUsers[0]);
    const parseResult = HeartbeatResponseData.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Malformed response: ${parseResult.error.toString()}`);
    }

    // return parseResult.data;

    const db = new PrismaClient();
    const accessManager = await db.accessManager.findUnique({
      where: { id: parseResult.data.accessManager.id },
      ...accessManagerSelect,
      rejectOnNotFound: true,
    });
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

    const localAccessUserMap: AccessUserMap = new Map();
    for (const accessUser of await db.accessUser.findMany({
      ...accessUserSelect(accessManager.id),
    })) {
      localAccessUserMap.set(accessUser.id, accessUser);
    }

    const addIds = [];
    const existingIds = [];
    const cloudAccessUserMap: AccessUserMap = new Map();
    for (const accessUser of parseResult.data.accessManager.accessUsers) {
      cloudAccessUserMap.set(accessUser.id, accessUser);
      if (localAccessUserMap.has(accessUser.id)) {
        existingIds.push(accessUser.id);
      } else {
        addIds.push(accessUser.id);
      }
    }

    if (
      cloudAccessUserMap.size !==
      parseResult.data.accessManager.accessUsers.length
    ) {
      throw new Error(`Duplicate cloud access user id's.`);
    }

    const existingIdsSet = new Set(existingIds);
    const removeIds = [...localAccessUserMap.keys()].filter(
      (x) => !existingIdsSet.has(x)
    );

    return {
      localAccessUserMap: [...localAccessUserMap],
      cloudAccessUserMap: [...cloudAccessUserMap],
      addIds,
      existingIds,
      removeIds,
    };
  }
}
