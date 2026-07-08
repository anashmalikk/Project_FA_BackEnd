import type { RequestHandler } from "express";

export const authenticate: RequestHandler = (req, res, next) => {
  const authorizationHeader = req.header("authorization");

  if (!authorizationHeader) {
    res.status(401).json({
      success: false,
      message: "Please login to access this route"
    });
    return;
  }

  const [, token] = authorizationHeader.split(" ");

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Invalid authorization header"
    });
    return;
  }

  res.locals["authToken"] = token;
  next();
};
