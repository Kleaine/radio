// middleware/auth.ts — JWT 鉴权中间件

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "radio-dj-secret-2026";

export interface AuthRequest extends Request {
  userId?: number;
  username?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.fail(401, "未提供有效的认证令牌");
    return;
  }

  const token = authHeader.slice(7);

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
    req.userId = payload.userId;
    req.username = payload.username;
    next();
  } catch (err: any) {
    if (err.name === "TokenExpiredError") {
      res.fail(401, "认证令牌已过期，请重新登录");
    } else {
      res.fail(401, "认证令牌无效");
    }
  }
}

export function generateToken(userId: number, username: string): string {
  return jwt.sign(
    { userId, username },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}
