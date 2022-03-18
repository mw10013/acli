import { PrismaClient } from "@prisma/client";

export function prismaClient() {
  const client = new PrismaClient({
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

  client.$on("query", (e) => {
    console.log("Query: " + e.query);
    console.log("Params: " + e.params);
  });
  return client;
}
