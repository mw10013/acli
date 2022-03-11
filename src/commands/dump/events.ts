import { Command, Flags } from "@oclif/core";
import { PrismaClient } from "@prisma/client";

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

    // const db = new PrismaClient();
    // const db = new PrismaClient({ log: ["query", "info", "warn", "error"] });
    const db = new PrismaClient({
      log: [
        {
          emit: "event",
          level: "query",
        },
        "info",
        "warn",
        "error",
      ],
    });

    db.$on("query", (e) => {
      console.log("Query: " + e.query);
      console.log("Params: " + e.params);
      console.log("Duration: " + e.duration + "ms");
    });

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
