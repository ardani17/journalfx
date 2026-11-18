import { PrismaClient } from "@prisma/client";
import { seedInstruments } from "./seed-instruments";

const prisma = new PrismaClient();

seedInstruments(prisma)
  .then((count) => console.log(`Seeded ${count} instruments.`))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
