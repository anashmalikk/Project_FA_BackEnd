import morgan from "morgan";
import { logger } from "@/config/logger";

export const httpLoggerMiddleware = morgan(
  ":method :url :status :res[content-length] - :response-time ms requestId=:req[x-request-id]",
  {
    stream: {
      write: (message: string): void => {
        logger.info(message.trim());
      }
    }
  }
);
