import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { env, logger } from "@/config";
import { AppError } from "@/errors";

interface ErrorResponse {
  success: false;
  message: string;
  requestId?: string;
  errors?: unknown;
  stack?: string;
}

export const errorMiddleware: ErrorRequestHandler = (error, req, res, _next) => {
  const isKnownError = error instanceof AppError;
  const isValidationError = error instanceof ZodError;
  const statusCode = isValidationError ? 400 : isKnownError ? error.statusCode : 500;
  const message =
    isValidationError || isKnownError ? error.message : "Internal server error";

  logger.error("Request failed", {
    requestId: req.requestId,
    statusCode,
    message,
    stack: error instanceof Error ? error.stack : undefined
  });

  const response: ErrorResponse = {
    success: false,
    message,
    requestId: req.requestId
  };

  if (isValidationError) {
    response.errors = error.flatten();
  }

  if (env.NODE_ENV !== "production" && error instanceof Error) {
    response.stack = error.stack;
  }

  res.status(statusCode).json(response);
};
