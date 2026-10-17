import { Router } from "express";
// import { authenticate } from "@/middlewares/authenticate.middleware";
import { JobController } from "@/controllers/job.controller";

export const jobRouter = Router();

jobRouter.get("/",  (req, res, next) => {
  void JobController.getJobAll(req, res, next);
});
jobRouter.get("/detail/:id",(req,res, next)=>{
  void JobController.getJobDetail(req,res, next);
});


