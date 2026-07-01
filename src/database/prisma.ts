import { PrismaClient } from "@prisma/client";
import { logger } from "@/config/logger";

export const prisma = new PrismaClient();

export const connectDatabase = async (): Promise<void> => {
  await prisma.$connect();
  logger.info("Database connection initialized");
};

export const disconnectDatabase = async (): Promise<void> => {
  await prisma.$disconnect();
  logger.info("Database connection closed");
};
