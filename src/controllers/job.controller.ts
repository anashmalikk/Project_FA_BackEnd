import type { NextFunction, Request, Response } from "express";
import { prisma } from "@/database/prisma";

export class JobController {
  public static async getJobAll(
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const jobs = await prisma.job.findMany({
        orderBy: {
          createdAt: "desc"
        },
        include: {
          organization: true,
          locations: true,
          skills: true,
          rounds: true,
          registration: true,
          displayConfig: true,
          images: true
        }
      });

      res.status(200).json({
        success: true,
        message: "Jobs fetched successfully",
        data: jobs
      });
    } catch (error) {
      next(error);
    }
  }

  public static async getJobDetail(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const id = req.params['id'];
      const job = await prisma.job.findUnique({
        where: {
          id: id,
        },
        include: {
          organization: true,
          locations: true,
          skills: true,
          rounds: true,
          registration: true,
          displayConfig: true,
          images: true
        }
      });
      if (!job) {
        res.status(404).json({
          success: false,
          message: "Job not found",
          data: null
        });
      }
      else {
        res.status(200).json({
          success: true,
          message: "Job fetched successfully",
          data: job
        });
      }
    }
    catch (error) {
      next(error);
    }
  }
}