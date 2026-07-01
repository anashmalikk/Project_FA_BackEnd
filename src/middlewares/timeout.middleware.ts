import type { RequestHandler } from "express";

export const timeoutMiddleware: RequestHandler = (_req, res, next) => {
  res.setTimeout(30_000, () => {
    res.status(503).json({
      success: false,
      message: "Request timeout"
    });
  });

  // TODO: Replace with an abort-aware timeout strategy for long-running operations.
  next();
};
