import { Command } from "@oclif/core";
import { PrismaClient } from "@prisma/client";

export default class Cmd extends Command {
  static description = "Dump users";
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
    const accessUsers = await db.accessUser.findMany({
      include: {
        accessPoints: {
          select: { id: true, name: true },
        },
      },
    });
    await db.$disconnect();
    this.log("Access Users: ", accessUsers);
    return { accessUsers };
  }
}
