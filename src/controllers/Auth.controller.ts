import type { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "@/database/prisma";
// import { sendEmail } from "@/lib/mailer"; // 👈 wire up your mail provider (Resend/SendGrid/SES/etc.)

/**
 * Assumes the schema additions in `schema-additions.prisma`
 * (RefreshToken + PasswordResetToken models, related back to User).
 *
 * REQUIRED env vars:
 *   JWT_ACCESS_SECRET
 *   JWT_REFRESH_SECRET
 *   ACCESS_TOKEN_TTL     (e.g. "15m")
 *   REFRESH_TOKEN_TTL_MS (e.g. "604800000" -> 7 days, used for both JWT + cookie + DB row)
 *   RESET_TOKEN_TTL_MIN  (e.g. "30")
 *   APP_URL
 *   NODE_ENV
 */

const ACCESS_SECRET = process.env["JWT_ACCESS_SECRET"] ?? process.env["JWT_SECRET"];
const REFRESH_SECRET = process.env["JWT_REFRESH_SECRET"];
const ACCESS_TTL = process.env["ACCESS_TOKEN_TTL"] ?? "15m";
const REFRESH_TTL_MS = Number(process.env["REFRESH_TOKEN_TTL_MS"] ?? 7 * 24 * 60 * 60 * 1000);
const RESET_TTL_MIN = Number(process.env["RESET_TOKEN_TTL_MIN"] ?? 30);

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  // Fail fast at boot rather than issuing insecure/undefined-signed tokens at runtime.
  throw new Error("JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set");
}

const SALT_ROUNDS = 12;
const GENERIC_AUTH_ERROR = "Invalid email or password";

/* ------------------------------------------------------------------ */
/* Validation schemas                                                   */
/* ------------------------------------------------------------------ */

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: emailSchema,
  password: passwordSchema,
  username: z.string().trim().min(3).max(30).optional(),
});

const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: emailSchema,
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

const hashPassword = (plain: string) => bcrypt.hash(plain, SALT_ROUNDS);
const verifyPassword = (plain: string, hash: string) => bcrypt.compare(plain, hash);
const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

const signAccessToken = (userId: string, role: string) =>
  jwt.sign({ sub: userId, role, type: "access" }, ACCESS_SECRET, {
    expiresIn: ACCESS_TTL as SignOptions["expiresIn"]
  });

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env["NODE_ENV"] === "production",
  sameSite: "strict" as const,
  path: "/api/auth",
  maxAge: REFRESH_TTL_MS,
};

const setRefreshCookie = (res: Response, token: string) => {
  res.cookie("refreshToken", token, REFRESH_COOKIE_OPTS);
};

const clearRefreshCookie = (res: Response) => {
  res.clearCookie("refreshToken", { path: "/api/auth" });
};

const getHeaderValue = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

const getRequestIp = (req: Request): string | undefined => {
  const forwardedFor = getHeaderValue(req.headers["x-forwarded-for"]);

  return forwardedFor?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? undefined;
};

const getRefreshTokenCookie = (req: Request): string | undefined => {
  const cookies = req.cookies as Record<string, unknown> | undefined;
  const rawToken = cookies?.["refreshToken"];

  return typeof rawToken === "string" ? rawToken : undefined;
};

/** Best-effort audit logging — never let this break the auth flow. */
const logAudit = async (userId: string, action: string, req: Request) => {
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        ip: getRequestIp(req),
        userAgent: getHeaderValue(req.headers["user-agent"])
      }
    });
  } catch (error) {
    console.error("[AuthController] audit log failed", error);
  }
};

const issueSession = async (userId: string) => {
  const rawRefreshToken = crypto.randomBytes(40).toString("hex");
  await prisma.refreshToken.create({
    data: {
      tokenHash: rawRefreshToken,
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
    },
  });
  return rawRefreshToken;
};

/* ------------------------------------------------------------------ */
/* Controller                                                            */
/* ------------------------------------------------------------------ */

export class AuthController {
  /** POST /api/auth/register */
  public static async register(req: Request, res: Response) {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { name, email, password, username } = parsed.data;

    try {
      const existing = await prisma.user.findFirst({
        where: { OR: [{ email }, ...(username ? [{ username }] : [])] },
      });
      if (existing) {
        // Don't reveal which field collided to an unauthenticated caller.
        return res.status(409).json({ success: false, message: "Could not create account" });
      }

      const hashed = await hashPassword(password);
      const user = await prisma.user.create({
        data: { name, email, password: hashed, username },
      });

      const accessToken = signAccessToken(user.id, user.role);
      const refreshToken = await issueSession(user.id);

      await logAudit(user.id, "REGISTER", req);
      setRefreshCookie(res, refreshToken);

      return res.status(201).json({
        success: true,
        message: "Account created",
        accessToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("[AuthController.register]", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /** POST /api/auth/login */
  public static async login(req: Request, res: Response) {
    const parsed = loginSchema.safeParse(req.body);
    console.log(parsed);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }
    const { email, password } = parsed.data;

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      console.log("user is found");
      // Always hash-compare against *something*, even if the user doesn't exist,
      // so response timing doesn't leak whether the email is registered.
      const passwordHashToCheck = user?.password ?? "$2b$12$invalidsaltinvalidsaltinvalidsalt.......";
      const isPasswordCorrect = await verifyPassword(password, passwordHashToCheck);

      if (!user || !isPasswordCorrect) {
        console.log("password is incorrect",user);
        return res.status(401).json({ success: false, message: GENERIC_AUTH_ERROR });
      }

      if (user.status !== "ACTIVE") {
        console.log("account is not active");
        return res.status(403).json({ success: false, message: "This account is not active" });
      }

      const accessToken = signAccessToken(user.id, user.role);
      const refreshToken = await issueSession(user.id);

      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date(), lastLoginIp: getRequestIp(req) },
      });
      await logAudit(user.id, "LOGIN", req);

      setRefreshCookie(res, refreshToken);
      return res.status(200).json({
        success: true,
        message: "Login successful",
        accessToken,
        user: { id: user.id, name: user.name, email: user.email, role: user.role },
      });
    } catch (error) {
      console.error("[AuthController.login]", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /** POST /api/auth/refresh — rotates the refresh token on every use */
  public static async refresh(req: Request, res: Response) {
    const rawToken = getRefreshTokenCookie(req);
    if (!rawToken) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }

    try {
      const tokenHash = hashToken(rawToken);
      const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

      if (!stored || stored.expiresAt < new Date()) {
        clearRefreshCookie(res);
        return res.status(401).json({ success: false, message: "Session expired, please log in again" });
      }

      const user = await prisma.user.findUnique({ where: { id: stored.userId } });
      if (user?.status !== "ACTIVE") {
        clearRefreshCookie(res);
        return res.status(401).json({ success: false, message: "Session expired, please log in again" });
      }

      // Rotate: delete the used token, issue a new one (prevents replay of a stolen token).
      await prisma.refreshToken.delete({ where: { tokenHash } });
      const newRefreshToken = await issueSession(user.id);
      const newAccessToken = signAccessToken(user.id, user.role);

      setRefreshCookie(res, newRefreshToken);
      return res.status(200).json({ success: true, accessToken: newAccessToken });
    } catch (error) {
      console.error("[AuthController.refresh]", error);
      clearRefreshCookie(res);
      return res.status(401).json({ success: false, message: "Session expired, please log in again" });
    }
  }

  /** POST /api/auth/logout */
  public static async logout(req: Request, res: Response) {
    const rawToken = getRefreshTokenCookie(req);
    try {
      if (rawToken) {
        await prisma.refreshToken.deleteMany({ where: { tokenHash: hashToken(rawToken) } });
      }
    } catch (error) {
      console.error("[AuthController.logout]", error);
      // Non-fatal — still clear the cookie client-side below.
    }

    clearRefreshCookie(res);
    return res.status(200).json({ success: true, message: "Logged out" });
  }

  /** POST /api/auth/logout-all — revoke every session for the current user */
  public static async logoutAll(req: Request & { userId?: string }, res: Response) {
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    try {
      await prisma.refreshToken.deleteMany({ where: { userId: req.userId } });
      await logAudit(req.userId, "LOGOUT_ALL", req);
      clearRefreshCookie(res);
      return res.status(200).json({ success: true, message: "Logged out of all devices" });
    } catch (error) {
      console.error("[AuthController.logoutAll]", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /** POST /api/auth/forgot-password */
  public static async forgotPassword(req: Request, res: Response) {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }
    const { email } = parsed.data;

    // Always return the same generic response, whether or not the email exists,
    // to prevent user enumeration via this endpoint.
    const genericResponse = {
      success: true,
      message: "If an account exists for that email, a reset link has been sent.",
    };

    try {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return res.status(200).json(genericResponse);

      const rawToken = crypto.randomBytes(32).toString("hex");
      await prisma.passwordResetToken.create({
        data: {
          tokenHash: hashToken(rawToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000),
        },
      });

      const resetUrl = `${process.env["APP_URL"] ?? "http://localhost:3000"}/reset-password?token=${rawToken}`;
      void resetUrl;
      // await sendEmail({
      //   to: user.email,
      //   subject: "Reset your password",
      //   text: `Reset your password: ${resetUrl} (expires in ${RESET_TTL_MIN} minutes)`,
      // });

      await logAudit(user.id, "PASSWORD_RESET_REQUESTED", req);
      return res.status(200).json(genericResponse);
    } catch (error) {
      console.error("[AuthController.forgotPassword]", error);
      // Still return the generic response — don't leak internal errors that could hint at user existence.
      return res.status(200).json(genericResponse);
    }
  }

  /** POST /api/auth/reset-password */
  public static async resetPassword(req: Request, res: Response) {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid input", errors: parsed.error.flatten() });
    }
    const { token, password } = parsed.data;

    try {
      const tokenHash = hashToken(token);
      const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });

      if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
        return res.status(400).json({ success: false, message: "Reset link is invalid or has expired" });
      }

      const hashed = await hashPassword(password);

      await prisma.$transaction([
        prisma.user.update({ where: { id: stored.userId }, data: { password: hashed } }),
        prisma.passwordResetToken.update({ where: { tokenHash }, data: { usedAt: new Date() } }),
        prisma.refreshToken.deleteMany({ where: { userId: stored.userId } }), // kill all existing sessions
      ]);

      await logAudit(stored.userId, "PASSWORD_RESET_COMPLETED", req);
      clearRefreshCookie(res);
      return res.status(200).json({ success: true, message: "Password reset successful, please log in" });
    } catch (error) {
      console.error("[AuthController.resetPassword]", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }

  /** POST /api/auth/change-password — requires auth middleware to set req.userId */
  public static async changePassword(req: Request & { userId?: string }, res: Response) {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: "Invalid input" });
    }
    if (!req.userId) {
      return res.status(401).json({ success: false, message: "Not authenticated" });
    }
    const { currentPassword, newPassword } = parsed.data;

    try {
      const user = await prisma.user.findUnique({ where: { id: req.userId } });
      if (!user) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      const isCorrect = await verifyPassword(currentPassword, user.password);
      if (!isCorrect) {
        return res.status(401).json({ success: false, message: "Current password is incorrect" });
      }

      const hashed = await hashPassword(newPassword);
      await prisma.$transaction([
        prisma.user.update({ where: { id: user.id }, data: { password: hashed } }),
        prisma.refreshToken.deleteMany({ where: { userId: user.id } }), // invalidate existing sessions
      ]);

      await logAudit(user.id, "PASSWORD_CHANGED", req);
      clearRefreshCookie(res);
      return res.status(200).json({ success: true, message: "Password changed, please log in again" });
    } catch (error) {
      console.error("[AuthController.changePassword]", error);
      return res.status(500).json({ success: false, message: "Internal server error" });
    }
  }
}
