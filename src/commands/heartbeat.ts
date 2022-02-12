import { Command, Flags } from "@oclif/core";
import { Prisma, PrismaClient } from "@prisma/client";
// const fetch = require("node-fetch");
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
              z.object({
                id: z.number().int(),
                name: z.string(),
              })
            ),
          })
          .strict()
      ),
    })
    .strict(),
});
type HeartbeatResponseData = z.infer<typeof HeartbeatResponseData>;

type t = HeartbeatResponseData["accessManager"]["accessUsers"][number];

const accessManagerSelect = Prisma.validator<Prisma.AccessManagerArgs>()({
  select: {
    id: true,
    name: true,
    accessPoints: {
      select: { id: true, name: true },
    },
  },
});
type AccessManager = Prisma.AccessUserGetPayload<typeof accessManagerSelect>;

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

    const accessUsers = await db.accessUser.findMany();
    const existing = new Set<number>(accessUsers.map((i) => i.id));
    const { accessUserMap, add, modify } =
      // eslint-disable-next-line unicorn/no-array-reduce
      parseResult.data.accessManager.accessUsers.reduce(
        ({ accessUserMap, add, modify }, v) => {
          accessUserMap.set(v.id, v);
          if (existing.has(v.id)) {
            modify.add(v.id);
          } else {
            add.add(v.id);
          }

          return { accessUserMap, add, modify };
        },
        {
          accessUserMap: new Map<
            number,
            typeof parseResult.data.accessManager.accessUsers[number]
            // HeartbeatResponseData["accessManager"]["accessUsers"][number]
          >(),
          add: new Set<number>(),
          modify: new Set<number>(),
        }
      );
    return {
      pointIds: [...pointIds],
      accessUsers,
      existing: [...existing],
      accessUserMap: [...accessUserMap],
      add: [...add],
      modify: [...modify],
    };
  }
}
