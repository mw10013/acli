import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();

async function seed() {
  await db.accessHub.create({
    data: {
      id: 1,
      name: "Brooklyn BnB",
      accessPoints: {
        create: [
          {
            id: 1,
            position: 1,
            name: "Front Door",
          },
          {
            id: 2,
            position: 2,
            name: "Back Door",
          },
          {
            id: 3,
            position: 3,
            name: "Basement Outside",
          },
          {
            id: 4,
            position: 4,
            name: "Basement Inside",
          },
          {
            id: 5,
            position: 5,
            name: "2nd Floor Front",
          },
          {
            id: 6,
            position: 6,
            name: "2nd Floor Back",
          },
          {
            id: 7,
            position: 7,
            name: "3rd Floor Front",
          },
          {
            id: 8,
            position: 8,
            name: "3rd Floor Back",
          },
          {
            id: 9,
            position: 9,
            name: "Unused",
          },
          {
            id: 10,
            position: 10,
            name: "Unused",
          },
        ],
      },
    },
  });
}

seed();
