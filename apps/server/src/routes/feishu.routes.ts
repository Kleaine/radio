// routes/feishu.routes.ts — 飞书 OAuth 桥梁
// 获取授权 URL + 回调处理

import { Router, Request, Response } from "express";
import { getDb } from "../db/init";
import jwt from "jsonwebtoken";

export const feishuRoutes = Router();

const JWT_SECRET = process.env.JWT_SECRET || "radio-dj-secret-2026";
const FEISHU_APP_ID = process.env.FEISHU_APP_ID || "";
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET || "";
const FEISHU_REDIRECT_URI = process.env.FEISHU_REDIRECT_URI || "http://localhost:3000/api/feishu/callback";

// ── GET /api/feishu/auth-url ──
feishuRoutes.get("/auth-url", (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    res.fail(400, "缺少 token 参数");
    return;
  }

  // 验证 token 有效性
  try {
    jwt.verify(token, JWT_SECRET);
  } catch {
    res.fail(401, "无效的认证令牌");
    return;
  }

  if (!FEISHU_APP_ID) {
    // Mock 模式：返回模拟 URL
    res.success({
      url: `https://passport.feishu.cn/suite/passthru/oauth/authorize?client_id=cli_mock&redirect_uri=${encodeURIComponent(FEISHU_REDIRECT_URI)}&response_type=code&state=${token}`,
    });
    return;
  }

  // 真实模式：拼装飞书官方授权 URL
  const authUrl = `https://passport.feishu.cn/suite/passthru/oauth/authorize?client_id=${FEISHU_APP_ID}&redirect_uri=${encodeURIComponent(FEISHU_REDIRECT_URI)}&response_type=code&state=${token}`;

  res.success({ url: authUrl });
});

// ── GET /api/feishu/callback ──
feishuRoutes.get("/callback", async (req: Request, res: Response) => {
  const { code, state } = req.query;

  if (!code || !state) {
    res.fail(400, "缺少授权码或 state 参数");
    return;
  }

  // state 是用户的 JWT token
  let userId: number;
  try {
    const payload = jwt.verify(state as string, JWT_SECRET) as { userId: number };
    userId = payload.userId;
  } catch {
    res.fail(401, "无效的 state 参数");
    return;
  }

  // Mock 模式：直接绑定成功
  if (!FEISHU_APP_ID || !FEISHU_APP_SECRET) {
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO feishu_bindings (user_id, feishu_user_id, feishu_access_token, token_expires_at)
      VALUES (?, ?, ?, datetime('now', '+2 hours', 'localtime'))
    `).run(userId, "mock_feishu_user", "mock_access_token");

    // 重定向回前端
    res.redirect(`/?bind=success`);
    return;
  }

  // 真实模式：用 code 换取 access_token
  try {
    const tokenRes = await fetch("https://passport.feishu.cn/suite/passport/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: FEISHU_APP_ID,
        client_secret: FEISHU_APP_SECRET,
        code: code as string,
        redirect_uri: FEISHU_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenRes.json() as any;

    if (!tokenData.access_token) {
      res.redirect(`/?bind=error&msg=token_exchange_failed`);
      return;
    }

    // 获取用户信息
    const userRes = await fetch("https://passport.feishu.cn/suite/passport/oauth/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const userData = await userRes.json() as any;

    // 存入数据库
    const db = getDb();
    db.prepare(`
      INSERT OR REPLACE INTO feishu_bindings (user_id, feishu_user_id, feishu_access_token, feishu_refresh_token, token_expires_at)
      VALUES (?, ?, ?, ?, datetime('now', '+2 hours', 'localtime'))
    `).run(userId, userData.user_id, tokenData.access_token, tokenData.refresh_token);

    res.redirect(`/?bind=success`);
  } catch (err: any) {
    console.error("[feishu] OAuth 回调处理失败:", err.message);
    res.redirect(`/?bind=error&msg=server_error`);
  }
});
