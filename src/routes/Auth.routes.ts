import { Router } from "express";
import { AuthController } from "@/controllers/Auth.controller";

export const authRouter = Router();

authRouter.post("/login", (req, res) => {
  void AuthController.login(req, res);
});
