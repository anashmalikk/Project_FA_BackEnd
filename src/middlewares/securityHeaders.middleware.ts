import type { RequestHandler } from "express";

export const securityHeadersMiddleware: RequestHandler = (_req, res, next) => {
  res.setHeader("x-content-type-options", "nosniff");
  res.setHeader("x-frame-options", "DENY");
  res.setHeader("referrer-policy", "no-referrer");

  // TODO: Extend security headers based on deployment requirements.
  next();
};
