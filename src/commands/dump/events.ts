import { Command, Flags } from "@oclif/core";
import { prismaClient } from "../../db";

export default class Cmd extends Command {
  static description = "Dump events";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {
    take: Flags.integer({
      char: "t",
      description: "Number of events to take",
      default: 10,
    }),
    skip: Flags.integer({
      char: "s",
      description: "Number of events to skip",
      default: 0,
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
    const accessEvents = await db.accessEvent.findMany({
      take: flags.take,
      skip: flags.skip,
      orderBy: { at: "desc" },
    });
    await db.$disconnect();
    this.log("Access Events: ", accessEvents);
    return { accessEvents };
  }
}
