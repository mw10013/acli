import { Command, Flags } from "@oclif/core";
import { z } from "zod";

// Zod seems to always call refine's and only calls transform's if prior goes through
const Data = z.object({
  requiredJsonDate: z // JSON date
    .string()
    .min(1)
    .refine(
      (v) => {
        console.log(`requiredJsonDate: refine: v: ${v}`);
        return !Number.isNaN(Date.parse(v));
      },
      {
        message: "Invalid date time",
      }
    )
    .transform((v) => {
      console.log(`requiredJsonDate: transform: v: ${v}`);
      return new Date(v);
    }),
  nullableJsonDate: z
    .string()
    .min(1)
    .nullable()
    .refine(
      (v) => {
        console.log(`nullableJsonDate: refine: v: ${v}`);
        return !v || !Number.isNaN(Date.parse(v));
      },
      {
        message: "Invalid date time",
      }
    )
    .transform((v) => {
      console.log(`nullableJsonDate: transform: v: ${v}`);
      return v ? new Date(v) : null;
    }),
});
type Data = z.infer<typeof Data>;

export default class Cmd extends Command {
  static description = "Zod, rhymes with god";
  static examples = ["<%= config.bin %> <%= command.id %>"];
  static enableJsonFlag = true;

  static flags = {};

  static args = [];

  async catch(error: Error): Promise<any> {
    // base class seems to swallow error
    throw error;
  }

  async run(): Promise<any> {
    // const { flags } = await this.parse(Cmd);
    const data = {
      requiredJsonDate: "2022-02-14T14:18:09.622Z",
      //   requiredJsonDate: "",
      //   requiredJsonDate: "a",
      //   requiredJsonDate: 7,
      //   requiredJsonDate: null,
      //   nullableJsonDate: null,
      //   nullableJsonDate: "",
      //   nullableJsonDate: "a",
      //   nullableJsonDate: 7,
      nullableJsonDate: "2022-02-14T14:18:09.622Z",
    };
    const parseResult = Data.safeParse(data);
    if (!parseResult.success) {
      throw new Error(`Malformed data: ${parseResult.error.toString()}`);
    }

    this.log("Zod: ", parseResult.data);
    return { data: parseResult.data };
  }
}
