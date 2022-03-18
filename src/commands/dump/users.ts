import { Command, Flags } from "@oclif/core";
import { prismaClient } from "../../db";

export default class Cmd extends Command {
  static description = "Dump users";
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
    swap: Flags.boolean({
      char: "w",
      description: "Swap codes of first two access users.",
      default: false,
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
    if (flags.swap) {
      const [accessUser1, accessUser2] = await db.accessUser.findMany({
        take: 2,
      });
      if (accessUser1 && accessUser2) {
        await db.accessHub.update({
          where: { id: accessUser1.accessHubId },
          data: {
            accessUsers: {
              update: [
                {
                  where: { id: accessUser1.id },
                  data: { code: `${accessUser1.code}-` },
                },
                {
                  where: { id: accessUser2.id },
                  data: { code: accessUser1.code },
                },
                {
                  where: { id: accessUser1.id },
                  data: { code: accessUser2.code },
                },
              ],
            },
          },
        });
      }
    }

    const accessUsers = await db.accessUser.findMany({
      include: {
        accessPoints: {
          select: { id: true, name: true },
        },
      },
      take: flags.take,
      skip: flags.skip,
    });
    await db.$disconnect();
    this.log("Access Users: ", accessUsers);
    return { accessUsers };
  }
}
