// routes/auth.routes.ts — 账户鉴权路由
// 注册 + 登录

import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import { getDb } from "../db/init";
import { generateToken } from "../middleware/auth";

export const authRoutes = Router();

// ── POST /api/register ──
authRoutes.post("/register", async (req: Request, res: Response) => {
  const { username, password } = req.body;

  // 参数校验
  if (!username || !password) {
    res.fail(400, "用户名和密码不能为空");
    return;
  }

  if (username.length < 2 || username.length > 32) {
    res.fail(400, "用户名长度应在 2-32 个字符之间");
    return;
  }

  if (password.length < 6) {
    res.fail(400, "密码长度不能少于 6 个字符");
    return;
  }

  const db = getDb();

  // 检查用户名是否已存在
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    res.fail(409, "注册终止：该账户名称在系统数据库中已被注册");
    return;
  }

  // bcrypt 加密密码
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  // 写入数据库
  db.prepare("INSERT INTO users (username, password_hash) VALUES (?, ?)").run(username, passwordHash);

  res.success(null, "注册成功，用户信息已成功持久化写入数据库");
});

// ── POST /api/login ──
authRoutes.post("/login", async (req: Request, res: Response) => {
  const { username, password } = req.body;

  // 参数校验
  if (!username || !password) {
    res.fail(400, "用户名和密码不能为空");
    return;
  }

  const db = getDb();

  // 查询用户
  const user = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as any;
  if (!user) {
    res.fail(404, "登录失败：该管理账号在系统数据库中不存在，请检查输入或先前往注册");
    return;
  }

  // 验证密码
  const isValid = await bcrypt.compare(password, user.password_hash);
  if (!isValid) {
    res.fail(401, "登录失败：密码验证不匹配，请重新核对后输入");
    return;
  }

  // 生成 JWT
  const token = generateToken(user.id, user.username);
  const loginAt = new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });

  res.success({ token, loginAt }, "身份鉴权通过");
});
