import { Command, Flags } from "@oclif/core";
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
    const parseResult = HeartbeatResponseData.safeParse(json);
    if (!parseResult.success) {
      throw new Error(`Malformed response: ${parseResult.error.toString()}`);
    }

    return json;
  }
}
