import { Router } from "express";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  return res.status(200).json({
    success: true,
    status: "ok",
    message: "Freshers Adda API is running"
  });
});

healthRouter.get("/ready", (_req, res) => {
  return res.status(200).json({
    success: true,
    status: "ok",
    message: "Freshers Adda API is ready"
  });
});

healthRouter.get("/live", (_req, res) => {
  return res.status(200).json({
    success: true,
    status: "ok",
    message: "Freshers Adda API is live"
  });
});
