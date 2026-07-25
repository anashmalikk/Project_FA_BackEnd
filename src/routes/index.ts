import { Router } from "express";
import { healthRouter } from "@/routes/health.routes";
import { jobRouter } from "@/routes/job.routes";
import { authRouter } from "@/routes/Auth.routes";

export const router = Router();

router.use(healthRouter);
router.use("/jobs", jobRouter);
router.use("/auth", authRouter);
