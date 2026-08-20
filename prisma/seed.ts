import { PrismaClient } from "@prisma/client";
import { runSeed } from "../src/services/seed";

const prisma = new PrismaClient();

runSeed(prisma)
  .then((log) => log.forEach((line) => console.log(line)))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
