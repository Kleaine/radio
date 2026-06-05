// middleware/response-wrapper.ts — 统一响应格式封装
// 所有接口返回 { code, message, data } 格式

import { Request, Response, NextFunction } from "express";

// 扩展 Response 类型
declare global {
  namespace Express {
    interface Response {
      success(data?: any, message?: string): void;
      fail(code: number, message: string): void;
    }
  }
}

export function responseWrapper(_req: Request, res: Response, next: NextFunction): void {
  // 成功响应
  res.success = function (data?: any, message = "success") {
    this.json({
      code: 200,
      message,
      data: data ?? null,
    });
  };

  // 失败响应
  res.fail = function (code: number, message: string) {
    this.status(code >= 400 ? code : 500).json({
      code,
      message,
      data: null,
    });
  };

  next();
}
