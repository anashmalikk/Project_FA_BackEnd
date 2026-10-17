import "express";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
      userId?: string;
      userRole?: string;
    }
  }
}

export {};