// middleware/error-handler.ts — 全局错误处理中间件

import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: number;
}

export function errorHandler(err: AppError, _req: Request, res: Response, _next: NextFunction): void {
  console.error("[error]", err.message);
  if (process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  const statusCode = err.statusCode || err.code || 500;
  const message = err.message || "服务器内部错误";

  res.status(statusCode >= 400 ? statusCode : 500).json({
    code: statusCode,
    message,
    data: null,
  });
}
