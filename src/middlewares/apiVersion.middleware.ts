import type { RequestHandler } from "express";

export const apiVersionMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("x-api-version", "v1");

  // TODO: Implement version negotiation strategy when multiple API versions exist.
  next();
};
