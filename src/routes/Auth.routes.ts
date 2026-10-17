import { Router } from "express";
import { AuthController } from "@/controllers/Auth.controller";
import { authenticate } from "@/middlewares/authenticate.middleware";

export const authRouter = Router();

authRouter.post("/register", (req, res) => {
  void AuthController.register(req, res);
});

authRouter.post("/login", (req, res) => {
  void AuthController.login(req, res);
});

authRouter.post("/refresh", (req, res) => {
  void AuthController.refresh(req, res);
});

authRouter.post("/logout", (req, res) => {
  void AuthController.logout(req, res);
});

authRouter.post("/logout-all", authenticate, (req, res) => {
  void AuthController.logoutAll(req, res);
});

authRouter.post("/forgot-password", (req, res) => {
  void AuthController.forgotPassword(req, res);
});

authRouter.post("/reset-password", (req, res) => {
  void AuthController.resetPassword(req, res);
});

authRouter.post("/change-password", authenticate, (req, res) => {
  void AuthController.changePassword(req, res);
});
