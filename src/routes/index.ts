import { Router } from "express";
import { healthRouter } from "@/routes/health.routes";
import { jobRouter } from "@/routes/job.routes";

export const router = Router();

router.use(healthRouter);
router.use("/jobs", jobRouter);
