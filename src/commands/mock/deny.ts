import { Command, Flags } from "@oclif/core";
import { prismaClient } from "../../db";

export default class Cmd extends Command {
  static description = "Mock access deny";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {
    point: Flags.integer({
      char: "p",
      description: "point id",
      required: true,
    }),
    code: Flags.string({
      char: "c",
      description: "code",
      default: "666",
    }),
  };

  static args = [];

  async catch(error: Error): Promise<any> {
    // base class seems to swallow error
    throw error;
  }

  async run(): Promise<any> {
    const { flags } = await this.parse(Cmd);

    const db = prismaClient();
    const accessPoint = await db.accessPoint.findUnique({
      where: { id: Number(flags.point) },
      rejectOnNotFound: true,
    });

    const accessEvent = await db.accessEvent.create({
      data: {
        at: new Date(),
        access: "deny",
        code: flags.code,
        accessPointId: accessPoint.id,
      },
    });

    await db.$disconnect();
    this.log("Grant Event", accessEvent);
    return { accessEvent };
  }
}
