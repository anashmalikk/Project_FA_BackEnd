import { Router } from "express";
import { healthRouter } from "@/routes/health.routes";

export const router = Router();

router.use(healthRouter);
