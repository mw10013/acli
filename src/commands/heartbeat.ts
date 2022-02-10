import { Command } from "@oclif/core";

export default class World extends Command {
  static description = "Post heartbeat to access cloud.";

  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {};

  static args = [];

  async run(): Promise<void> {
    this.log("heartbeat");
  }
}
