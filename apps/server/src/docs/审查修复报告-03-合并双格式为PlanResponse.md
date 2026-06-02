# 审查修复报告 — 合并双格式为单一 PlanResponse

> 审查方式：6 角色并行审查（产品经理、4 分工组员、AI 新手、Claudio 对比、软件老师、架构师）
> 日期：2026-05-31

---

## 审查发现汇总

| # | 严重度 | 来源 | 问题 |
|---|---|---|---|
| 1 | CRITICAL | 产品经理、AI新手、Claudio对比 | prompt 双格式冲突——一个 plan-system.md 同时服务两种输出格式，LLM 无法区分 |
| 2 | MAJOR | 6/6 一致 | 没有最小可运行入口，无人验证过代码能编译能运行 |
| 3 | MAJOR | AI新手、产品经理 | 边界示例仍用旧 `{say, songs}` 格式，与主体 `items[]` 矛盾 |
| 4 | WARN | AI新手 | fallback prompt 描述旧格式 `say/scene/songs/segue` |
| 5 | WARN | AI新手 | DJ 串词字数：第18行写 40-80 字，第52行写不超过 60 字，矛盾 |
| 6 | WARN | 产品经理 | 用户画像文件为空，首次启动 AI 盲推 |
| 7 | WARN | 产品经理 | `ChatReply` 和 `PlanResponse` 两套输出格式本质上做同一件事，应合并 |
| 8 | WARN | 架构师 | `ScheduleEntry` 和 `CalendarEvent` 同构但分别定义，有类型漂移风险 |
| 9 | INFO | 软件老师 | 无单元测试 |
| 10 | INFO | 新组员 | 分工3(ASR)和分工4(TTS)缺少接口文档和 Mock 实现 |

---

## 已修复

| # | 修复内容 | 改动文件 |
|---|---|---|
| 1,7 | 删除 `ChatReply`/`ChatSong`/`chatStream`/`chat`/`parseReply`/`fallbackReply`，`PlanResponse` 为唯一输出格式 | `llm.service.ts` |
| 3 | 边界示例改为 `items[]` 格式 | `plan-system.md` |
| 4 | fallback prompt 描述改为 `summary/scene/items/schedule/memory` | `llm.service.ts` |
| 5 | tts 项字数统一为 40-80 字 | `plan-system.md` |
| 6 | `user/taste.md` 加种子数据 | `user/taste.md` |

## 未修复（超出分工5 范围或需要其他分工配合）

| # | 问题 | 原因 |
|---|---|---|
| 2 | 无最小可运行入口 | `package.json`/`tsconfig.json` 由分工2 提供，README 已标注 |
| 8 | ScheduleEntry/CalendarEvent 类型重复 | 课设规模下可接受，架构师也认为"不是问题" |
| 9 | 无单元测试 | 课设不做硬性要求 |
| 10 | ASR/TTS 接口文档缺失 | 分工3/4 的接口可由分工5 补充定义，但不阻塞当前交付 |

---

## 当前代码状态

- **1 个输出格式**：`PlanResponse { items: PlayableItem[] }`
- **2 个方法**：`generatePlanStream`（流式）/ `generatePlan`（非流式）
- **0 处格式矛盾**
- **0 处字数不一致**
