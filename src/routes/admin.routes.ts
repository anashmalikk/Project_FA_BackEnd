import { Router } from "express";
import { AdminController } from "@/controllers/admin.controller";
import { authenticate } from "@/middlewares/authenticate.middleware";

export const adminRouter = Router();

adminRouter.use(authenticate);

/* Dashboard */
adminRouter.get("/stats", (req, res, next) => {
  void AdminController.getStats(req, res, next);
});

/* Users */
adminRouter.get("/users", (req, res, next) => {
  void AdminController.getAllUsers(req, res, next);
});

adminRouter.patch("/users/:id", (req, res, next) => {
  void AdminController.updateUser(req, res, next);
});

/* Jobs */
adminRouter.get("/jobs", (req, res, next) => {
  void AdminController.getAllJobs(req, res, next);
});

adminRouter.get("/jobs/:id", (req, res, next) => {
  void AdminController.getJob(req, res, next);
});

adminRouter.post("/jobs", (req, res, next) => {
  void AdminController.createJob(req, res, next);
});

adminRouter.put("/jobs/:id", (req, res, next) => {
  void AdminController.updateJob(req, res, next);
});

adminRouter.delete("/jobs/:id", (req, res, next) => {
  void AdminController.deleteJob(req, res, next);
});

/* Organizations */
adminRouter.get("/organizations", (req, res, next) => {
  void AdminController.getAllOrganizations(req, res, next);
});

adminRouter.post("/organizations", (req, res, next) => {
  void AdminController.createOrganization(req, res, next);
});

adminRouter.put("/organizations/:id", (req, res, next) => {
  void AdminController.updateOrganization(req, res, next);
});

adminRouter.delete("/organizations/:id", (req, res, next) => {
  void AdminController.deleteOrganization(req, res, next);
});

/* Roles & Permissions */
adminRouter.get("/roles", (req, res, next) => {
  void AdminController.getAllRoles(req, res, next);
});

adminRouter.post("/roles", (req, res, next) => {
  void AdminController.createRole(req, res, next);
});

adminRouter.put("/roles/:id/permissions", (req, res, next) => {
  void AdminController.updateRolePermissions(req, res, next);
});

adminRouter.delete("/roles/:id", (req, res, next) => {
  void AdminController.deleteRole(req, res, next);
});

/* Profile */
adminRouter.get("/profile", (req, res, next) => {
  void AdminController.getProfile(req, res, next);
});

adminRouter.put("/profile", (req, res, next) => {
  void AdminController.updateProfile(req, res, next);
});