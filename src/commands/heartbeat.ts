import { Command, Flags } from "@oclif/core";
// const fetch = require("node-fetch");
import fetch from "node-fetch";

export default class Cmd extends Command {
  static description = "Post heartbeat to access cloud.";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {
    host: Flags.string({
      char: "h",
      description: "Heartbeat api host",
      default: "http://localhost:3000",
    }),
  };
  static args = [];

  async run(): Promise<any> {
    const { flags } = await this.parse(Cmd);
    const body = {
      accessManager: {
        id: 1,
      },
    };
    const response = await fetch(`${flags.host}/api/accessmanager/heartbeat`, {
      method: "post",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
    if (!response.ok) {
      const text = await response.text();
      this.error(text);
      return { error: text };
    }

    if (response.ok) {
      const json = await response.json();
      this.log(json);
      return json;
    }
  }
}

//   const body = { a: 1 };
//   fetch("https://httpbin.org/post", {
//     method: "post",
//     body: JSON.stringify(body),
//     headers: { "Content-Type": "application/json" },
//   })
//     .then((res) => res.json())
//     .then((json) => console.log(json));
// }
