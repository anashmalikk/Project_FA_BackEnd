import path from "node:path";
import winston from "winston";
import { env } from "@/config/env";

const logFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

export const logger = winston.createLogger({
  level: env.NODE_ENV === "production" ? "info" : "debug",
  defaultMeta: {
    service: "freshers-adda-backend"
  },
  format: logFormat,
  transports: [
    new winston.transports.Console({
      format:
        env.NODE_ENV === "production"
          ? logFormat
          : winston.format.combine(winston.format.colorize(), winston.format.simple())
    }),
    new winston.transports.File({
      filename: path.join("logs", "combined.log")
    }),
    new winston.transports.File({
      filename: path.join("logs", "error.log"),
      level: "error"
    })
  ]
});
