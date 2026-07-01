import type { Server } from "node:http";
import { app } from "@/app";
import { env, logger } from "@/config";
import { connectDatabase, disconnectDatabase } from "@/database/prisma";

let server: Server | undefined;

const startServer = async (): Promise<void> => {
  await connectDatabase();

  server = app.listen(env.PORT, () => {
    logger.info(`Freshers Adda backend listening on port ${String(env.PORT)}`);
  });
};

const shutdown = (signal: NodeJS.Signals): void => {
  logger.info(`Received ${signal}. Starting graceful shutdown.`);

  if (!server) {
    void disconnectDatabase().finally(() => process.exit(0));
    return;
  }

  server.close((error?: Error) => {
    if (error) {
      logger.error("HTTP server shutdown failed", { error });
      process.exit(1);
    }

    void (async (): Promise<void> => {
      await disconnectDatabase();
      logger.info("Graceful shutdown complete");
      process.exit(0);
    })();
  });
};

process.on("SIGTERM", (signal) => {
  shutdown(signal);
});

process.on("SIGINT", (signal) => {
  shutdown(signal);
});

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled promise rejection", { reason });
  process.exit(1);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", { error });
  process.exit(1);
});

void startServer();
