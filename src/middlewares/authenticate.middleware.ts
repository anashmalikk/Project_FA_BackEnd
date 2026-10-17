import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/config";

interface AccessTokenPayload {
  sub: string;
  role?: string;
  type?: string;
}

const getBearerToken = (authorizationHeader: string | undefined): string | undefined => {
  if (!authorizationHeader) return undefined;

  const [scheme, token] = authorizationHeader.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : undefined;
};

const getCookieToken = (cookies: unknown): string | undefined => {
  const parsedCookies = cookies as Record<string, unknown> | undefined;
  const token = parsedCookies?.["accessToken"];

  return typeof token === "string" ? token : undefined;
};

export const authenticate: RequestHandler = (req, res, next) => {
  const token = getBearerToken(req.header("authorization")) ?? getCookieToken(req.cookies);

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Please login to access this route"
    });
    return;
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
    if (payload.type !== "access" || !payload.sub) {
      throw new Error("Invalid token payload");
    }

    req.userId = payload.sub;
    req.userRole = payload.role;
    res.locals["authToken"] = token;
    next();
  } catch {
    res.status(401).json({
      success: false,
      message: "Session expired, please log in again"
    });
  }
};
