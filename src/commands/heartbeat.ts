import { Command } from "@oclif/core";
// const fetch = require("node-fetch");
import fetch from "node-fetch";

export default class Cmd extends Command {
  static description = "Post heartbeat to access cloud.";
  static examples = ["<%= config.bin %> <%= command.id %>"];

  static flags = {};

  static args = [];

  async run(): Promise<void> {
    this.log("heartbeat");
    const body = { a: 1 };

    fetch("https://httpbin.org/post", {
      method: "post",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    })
      .then((res) => res.json())
      .then((json) => console.log(json));
  }
}
