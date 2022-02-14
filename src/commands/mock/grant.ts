import { Command, Flags } from "@oclif/core";
import { flags } from "@oclif/core/lib/parser";
import { PrismaClient } from "@prisma/client";
import { number } from "zod";

export default class Cmd extends Command {
  static description = "Mock access grant";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {
    point: Flags.string({
      char: "p",
      description: "point id",
      required: true,
    }),
    user: Flags.string({
      char: "u",
      description: "user id",
      required: true,
    }),
    code: Flags.string({
      char: "c",
      description: "code",
      default: "1357",
    }),
  };

  static args = [];

  async catch(error: Error): Promise<any> {
    // base class seems to swallow error
    throw error;
  }

  async run(): Promise<any> {
    const { flags } = await this.parse(Cmd);
    if (!Number.isInteger(Number(flags.user))) {
      throw new TypeError(`User must be an integer: ${flags.user}`);
    }

    const db = new PrismaClient();
    await db.accessPoint.findUnique({
      where: { id: Number(flags.point) },
    });

    const accessEvent = await db.accessEvent.create({
      data: {
        at: new Date(),
        access: "grant",
        code: flags.code,
        accessUserId: Number(flags.user),
        accessPointId: Number(flags.point),
      },
    });

    await db.$disconnect();
    // this.log("Access Manager: ", accessManager);
    this.log("Grant Event", accessEvent);
    return { flags, accessEvent };
  }
}
