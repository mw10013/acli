import { Command } from "@oclif/core";
import { PrismaClient } from "@prisma/client";

export default class Cmd extends Command {
  static description = "Dump access manager";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {};

  static args = [];

  async catch(error: Error): Promise<any> {
    // base class seems to swallow error
    throw error;
  }

  async run(): Promise<any> {
    const db = new PrismaClient();
    const accessManager = await db.accessManager.findFirst({
      include: {
        accessPoints: {
          select: { id: true, name: true, position: true },
          orderBy: { position: "asc" },
        },
      },
    });
    await db.$disconnect();
    this.log("Access Manager: ", accessManager);
    return { accessManager };
  }
}
