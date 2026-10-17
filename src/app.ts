import compression from "compression";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { env } from "@/config";
import { apiVersionMiddleware } from "@/middlewares/apiVersion.middleware";
import { errorMiddleware } from "@/middlewares/error.middleware";
import { httpLoggerMiddleware } from "@/middlewares/logger.middleware";
import { notFoundMiddleware } from "@/middlewares/notFound.middleware";
import { rateLimiterMiddleware } from "@/middlewares/rateLimiter.middleware";
import { requestIdMiddleware } from "@/middlewares/requestId.middleware";
import { securityHeadersMiddleware } from "@/middlewares/securityHeaders.middleware";
import { timeoutMiddleware } from "@/middlewares/timeout.middleware";
import { router } from "@/routes";

export const createApp = (): express.Application => {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(requestIdMiddleware);
  app.use(httpLoggerMiddleware);
  app.use(helmet());
  app.use(securityHeadersMiddleware);
  app.use(
    cors({
      origin: [
        "https://fafront.netlify.app",
        "http://localhost:3000",
      ],
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "x-request-id",
      ],
    })
  );

  app.use(compression());
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ extended: true, limit: "1mb" }));
  app.use(timeoutMiddleware);
  app.use(rateLimiterMiddleware);
  app.use(apiVersionMiddleware);

  app.use(env.API_PREFIX, router);

  app.use(notFoundMiddleware);
  app.use(errorMiddleware);

  return app;
};

export const app = createApp();
