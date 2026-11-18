import type { NextFunction, Request, Response } from "express";
import { prisma } from "@/database/prisma";

export class JobController {
  public static async getJobAll(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = Math.max(1, Number(req.query["page"]) || 1);
      const limit = Math.min(
        100,
        Math.max(1, Number(req.query["limit"]) || 10)
      );

      const skip = (page - 1) * limit;
      const search =
        typeof req.query["search"] === "string"
          ? req.query["search"].trim()
          : "";
      const where = search
        ? {
          title: {
            contains: search,
            mode: "insensitive" as const
          }
        }
        : {};
      const jobs = await prisma.job.findMany({
        where,
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
        },
        skip,
        take: limit,

      });
      const count = await prisma.job.count({where});

      res.status(200).json({
        success: true,
        message: "Jobs fetched successfully",
        data: jobs,
        total: count
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