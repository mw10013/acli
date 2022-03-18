import { Command, Flags } from "@oclif/core";
import { prismaClient } from "../../db";

export default class Cmd extends Command {
  static description = "Mock access grant";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {
    point: Flags.integer({
      char: "p",
      description: "point id",
      required: true,
    }),
    user: Flags.integer({
      char: "u",
      description: "user id",
      required: true,
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
    const accessUser = await db.accessUser.findUnique({
      where: { id: Number(flags.user) },
      rejectOnNotFound: true,
    });

    const accessPoint = await db.accessPoint.findUnique({
      where: { id: Number(flags.point) },
      rejectOnNotFound: true,
    });

    const accessEvent = await db.accessEvent.create({
      data: {
        at: new Date(),
        access: "grant",
        code: accessUser.code,
        accessUserId: accessUser.id,
        accessPointId: accessPoint.id,
      },
    });

    await db.$disconnect();
    this.log("Grant Event", accessEvent);
    return { accessEvent };
  }
}
