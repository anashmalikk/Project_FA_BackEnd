import type { NextFunction, Request, Response } from "express";
import { prisma } from "@/database/prisma";

export class AdminController {
    public static async getStats(
        _req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            const [
                users,
                jobs,
                organizations,
                // applications,
                activeJobs,
            ] = await Promise.all([
                prisma.user.count(),
                prisma.job.count(),
                prisma.organization.count(),
                // prisma.application.count(),
                prisma.job.count({
                    where: {
                        status: "LIVE",
                    },
                }),
            ]);

            res.status(200).json({
                success: true,
                message: "Stats fetched successfully",
                data: {
                    users,
                    jobs,
                    organizations,
                    applications: 0,
                    activeJobs,
                },
            });
        } catch (error) {
            next(error);
        }
    }

    public static async getAllUsers(_req: Request, res: Response, next: NextFunction) {
        try {
            const users = await prisma.user.findMany({
                orderBy: {
                    createdAt: "desc",
                },
            });
            res.status(200).json({
                success: true,
                message: "Users fetched successfully",
                data: users,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async updateUser(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { name, email, password, username } = req.body;
            const user = await prisma.user.update({
                where: {
                    id: id,
                },
                data: {
                    name,
                    email,
                    password,
                    username,
                },
            });
            res.status(200).json({
                success: true,
                message: "User updated successfully",
                data: user,
            });
        } catch (error) {
            next(error);
        }
    }

    /* ---------------------------------- Jobs ---------------------------------- */

    public static async getAllJobs(req: Request, res: Response, next: NextFunction) {
        try {
            const page = Math.max(1, Number(req.query["page"]) || 1);
            const limit = Math.min(
                100,
                Math.max(1, Number(req.query["limit"]) || 10)
            );

            const skip = (page - 1) * limit;
            const jobs = await prisma.job.findMany({
                orderBy: {
                    createdAt: "desc",
                },
                include: {
                    organization: true,
                    locations: true,
                    skills: true,
                    rounds: true,
                    registration: true,
                    images: true,
                },
                skip,
                take: limit,
            });
            const total = await prisma.job.count();
            
            res.status(200).json({
                success: true,
                message: "Jobs fetched successfully",
                data: {
                    jobs,
                    total: total,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                    },
                },
            });
        } catch (error) {
            next(error);
        }
    }

    public static async getJob(req: Request, res: Response, next: NextFunction) {
        try {
            const id = req.params["id"];
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
                    images: true,
                },
            });
            if (!job) {
                res.status(404).json({
                    success: false,
                    message: "Job not found",
                    data: null,
                });
            } else {
                res.status(200).json({
                    success: true,
                    message: "Job fetched successfully",
                    data: job,
                });
            }
        } catch (error) {
            next(error);
        }
    }

    public static async createJob(req: Request, res: Response, next: NextFunction) {
        try {
            const { title, description, publicUrl, startDate, endDate, status, type, subtype, organizationId, visibility, region } = req.body;
            const job = await prisma.job.create({
                data: {
                    title,
                    description,
                    publicUrl,
                    startDate,
                    endDate,
                    status,
                    type,
                    subtype,
                    visibility,
                    region,
                    apiId: "Manual",

                    organization: {
                        connect: { id: organizationId },
                    },

                    // Keep your other existing relation fields here
                },
            });
            res.status(201).json({
                success: true,
                message: "Job created successfully",
                data: job,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async updateJob(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const { title, description, publicUrl, startDate, endDate, status, type, subtype, organizationId, displayConfigId, images, locations, skills, rounds, registration } = req.body;
            const job = await prisma.job.update({
                where: {
                    id: id,
                },
                data: {
                    title,
                    description,
                    publicUrl,
                    startDate,
                    endDate,
                    status,
                    type,
                    subtype,
                    organization: {
                        connect: {
                            id: organizationId,
                        },
                    },
                    displayConfig: {
                        connect: {
                            id: displayConfigId,
                        },
                    },
                    images: {
                        create: images,
                    },
                    locations: {
                        create: locations,
                    },
                    skills: {
                        create: skills,
                    },
                    rounds: {
                        create: rounds,
                    },
                    registration: {
                        create: registration,
                    },
                },
            });
            res.status(200).json({
                success: true,
                message: "Job updated successfully",
                data: job,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async deleteJob(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const job = await prisma.job.delete({
                where: {
                    id: id,
                },
            });
            res.status(200).json({
                success: true,
                message: "Job deleted successfully",
                data: job,
            });
        } catch (error) {
            next(error);
        }
    }
    /* ----------------------------- Organizations ----------------------------- */

    public static async getAllOrganizations(req: Request, res: Response, next: NextFunction) {
        try {
            const page = Math.max(1, Number(req.query["page"]) || 1);
            const limit = Math.min(
                100,
                Math.max(1, Number(req.query["limit"]) || 10)
            );

            const skip = (page - 1) * limit;

            const [organizations, total] = await prisma.$transaction([
                prisma.organization.findMany({
                    skip,
                    take: limit,
                    orderBy: {
                        createdAt: "desc",
                    },
                }),
                prisma.organization.count(),
            ]);

            res.status(200).json({
                success: true,
                message: "Organizations fetched successfully",
                data: organizations,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            });
        } catch (error) {
            next(error);
        }
    }

    public static async createOrganization(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, description, publicUrl, logo, apiId, } = req.body;
            const organization = await prisma.organization.create({
                data: {
                    apiId,
                    name,
                    description,
                    publicUrl,
                    logo,
                },
            });
            res.status(201).json({
                success: true,
                message: "Organization created successfully",
                data: organization,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async updateOrganization(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            const { id } = req.params;
            const { name, description, publicUrl, logo, apiId } = req.body;

            const organization = await prisma.organization.update({
                where: { id },
                data: {
                    ...(name !== undefined && { name }),
                    ...(description !== undefined && { description }),
                    ...(publicUrl !== undefined && { publicUrl }),
                    ...(logo !== undefined && { logo }),
                    ...(apiId !== undefined && { apiId }),
                },
            });

            res.status(200).json({
                success: true,
                message: "Organization updated successfully",
                data: organization,
            });
        } catch (error) {
            next(error);
        }
    }
    public static async deleteOrganization(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const organization = await prisma.organization.delete({
                where: {
                    id: id,
                },
            });
            res.status(200).json({
                success: true,
                message: "Organization deleted successfully",
                data: organization,
            });
        } catch (error) {
            next(error);
        }
    }
    /* -------------------------- Roles & Permissions -------------------------- */

    public static async getAllRoles(_req: Request, res: Response, next: NextFunction) {
        try {
            const roles = await prisma.role.findMany({
                orderBy: {
                    createdAt: "desc",
                },
            });
            res.status(200).json({
                success: true,
                message: "Roles fetched successfully",
                data: roles,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async createRole(
        req: Request,
        res: Response,
        next: NextFunction
    ) {
        try {
            const { name, permissions } = req.body;

            const role = await prisma.role.create({
                data: {
                    name,
                    permissions: permissions ?? [],
                },
            });

            res.status(201).json({
                success: true,
                message: "Role created successfully",
                data: role,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async updateRolePermissions(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            // const { permissions } = req.body;
            const role = await prisma.role.update({
                where: {
                    id: id,
                },
                data: {

                },
            });
            res.status(200).json({
                success: true,
                message: "Role updated successfully",
                data: role,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async deleteRole(req: Request, res: Response, next: NextFunction) {
        try {
            const { id } = req.params;
            const role = await prisma.role.delete({
                where: {
                    id: id,
                },
            });
            res.status(200).json({
                success: true,
                message: "Role deleted successfully",
                data: role,
            });
        } catch (error) {
            next(error);
        }
    }

    /* -------------------------------- Profile --------------------------------- */

    public static async getProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const profile = await prisma.user.findUnique({
                where: {
                    id: req.userId,
                },
                select: {
                    id: true,
                    name: true,
                    email: true,
                    role: true,
                },
            });
            res.status(200).json({
                success: true,
                message: "Profile fetched successfully",
                data: profile,
            });
        } catch (error) {
            next(error);
        }
    }

    public static async updateProfile(req: Request, res: Response, next: NextFunction) {
        try {
            const { name, email, password, username } = req.body;
            const profile = await prisma.user.update({
                where: {
                    id: req.userId,
                },
                data: {
                    name,
                    email,
                    password,
                    username,
                },
            });
            res.status(200).json({
                success: true,
                message: "Profile updated successfully",
                data: profile,
            });
        } catch (error) {
            next(error);
        }
    }
}