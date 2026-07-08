import { Router } from "express";
import { authenticate } from "@/middlewares/authenticate.middleware";
import { JobController } from "@/controllers/job.controller";

export const jobRouter = Router();

jobRouter.get("/", authenticate, (req, res, next) => {
  void JobController.getJobAll(req, res, next);
});
