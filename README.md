# Radio — AI 音乐电台

私人 AI 音乐电台。AI DJ 根据时间、天气、日程和用户偏好，生成带有 DJ 串词的电台播报计划。

> Status: Alpha — AI Service Layer complete. Frontend & routing in progress.
> 5 轮审查 · 20+ 问题清零 · Mock-First 架构

---

## 项目结构

```
radio/
├── apps/
│   ├── web/               ← 前端（React 播放器，待开发）
│   ├── tts/               ← TTS 语音合成（GPT-SoVITS，已完成）
│   └── server/            ← 后端
│       └── src/
│           ├── services/   ← AI 大脑 + 外部 API（已完成）
│           ├── prompts/    ← AI DJ 人设卡
│           ├── docs/       ← 架构文档 + 节目示例 + 对接分析
│           └── interface/  ← 跨模块接口定义
├── data/                  ← 运行时数据
└── user/                  ← 用户画像
```

---

## AI Service Layer — 已完成

| 模块 | 文件 | 亮点 |
|---|---|---|
| AI 大脑 | `services/llm.service.ts` | 豆包流式生成播报计划，JSON 三层提取，60s 超时 |
| 播报增强 | `services/plan-enrich.ts` | AI 输出 → QQ 音乐搜索 → 补全真实歌曲 ID/URL |
| 上下文组装 | `services/context.service.ts` | 时间 + 天气 + 日程 + 播放历史 + 用户画像 |
| 音乐服务 | `services/music.service.ts` | QQ 音乐 Mock/真实双实现 |
| 天气服务 | `services/weather.service.ts` | OpenWeather → Wttr.in → Mock 三层回退 + 5min 缓存 |
| 日程服务 | `services/calendar.service.ts` | schedule.txt 读写，AI 聊天自动更新 |
| 偏好记忆 | `services/memory-writer.ts` | AI 发现偏好 → 自动记录到 Markdown 文件 |
| DJ 人设 | `prompts/plan-system.md` | "说质感不说标签" · 冷知识节制 · 专业电台人格 |
| 接口定义 | `interface/music.service.interface.ts` | 音乐服务接口契约 |

### 各分工状态

| 分工 | 状态 | 交付物 | 待完成 |
|---|---|---|---|
| 分工5 AI | 已完成 | 7 个 service 文件 + prompt + 接口 + 文档 | — |
| 分工4 TTS | 已完成 | GPT-SoVITS 本地服务，三种音色 | 参考音频效果待联调验证；无 Mock 模式 |
| 分工2 后端 | 开发中 | Fastify 路由 + DB + SSE | 见下方验收要求 |
| 分工1 前端 | 待开发 | React 播放器 | 见下方 |
| 分工3 ASR | 待开发 | 语音识别 | 接口未定义，需与分工2 协商注入点 |

#### 分工2 要做什么

- 项目骨架：`package.json`、`tsconfig.json`、Fastify 入口文件
- `/api/dispatch` 路由：按 `意图规则表.md` 实现三层分发（正则指令 → 正则搜索 → LLM）
- `/api/player/*` 路由：播放控制（播放/暂停/下一首/上一首/随机/循环）
- SQLite 数据库：plays 表（记录播放历史，供给 context.service）
- SSE 流推送：`chunk` 事件（逐字文本）+ `done` 事件（完整 PlanResponse JSON）
- WAV→URL 适配层：调分工4 TTS → 存音频 → 生成前端可访问的 URL → 传给 `enrichItems`
- `.env` 加载：读环境变量 → 传进各 service 工厂函数

#### 分工2 自测要求

推 PR 前用 curl 验证：

**1. 服务能启动**
```bash
pnpm install && pnpm dev   # 不报错
```

**2. Mock 模式下 AI 链路能跑通**
```bash
curl -N -X POST http://localhost:8080/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{"message":"好累想听点放松的"}'
```
返回的 SSE 流不中断，`done` 事件里 `items[]` 至少包含 tts 和 song 两种类型。

**3. 搜索路径能走通**
```bash
curl -X POST http://localhost:8080/api/dispatch \
  -H "Content-Type: application/json" \
  -d '{"message":"搜索周杰伦"}'
```
返回搜索结果列表，不调 LLM。

#### 分工1 要做什么

- React + Vite + PWA 项目骨架
- SSE 客户端：接收 `chunk` 事件逐字渲染 + `done` 事件解析 PlanResponse
- 播放器组件：按 items[] 顺序播放（tts 语音 → 歌曲 → tts 语音 → 歌曲）
- 歌曲卡片：封面 + 歌名 + 歌手 + AI 推荐理由
- 聊天区：DJ 话术气泡
- 指令输入框 + 语音按钮（预留分工3 ASR 入口）

#### 分工4 TTS 可能需修改

联调时如果遇到以下问题，参考 `apps/server/src/docs/TTS对接分析.md`：
- 中文合成发音不自然 → 换中文参考音频
- GPT-SoVITS 环境搭不起来 → 暂无 Mock 兜底，需要本机配好环境
- 系统没装 ffmpeg → 安装 ffmpeg（后处理依赖）

---

## 技术栈

| 层 | 选型 |
|---|---|
| LLM | 豆包（火山引擎），OpenAI SDK，流式输出 |
| 音乐 | QQ 音乐（qq-music-api + 绿钻 Cookie） |
| 天气 | OpenWeatherMap / Wttr.in / Mock 三层回退 |
| 后端 | Fastify + TypeScript + SQLite |
| 前端 | React + Vite + PWA |

---

## 快速开始

> 当前仓库包含 AI Service Layer 的全部代码。`package.json`、`tsconfig.json`、路由层由后端同学提供。

```bash
git clone <repo-url> radio
cd radio
pnpm install
cp apps/server/.env.example apps/server/.env
# 编辑 .env，填入 DOUBAO_API_KEY（不填则 Mock 模式运行）
pnpm dev
```

---

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包 API Key | 否（不填走 Mock） |
| `QQ_MUSIC_COOKIE` | QQ 音乐 Cookie | 否 |
| `OPENWEATHER_API_KEY` | OpenWeather Key | 否（不填走 Wttr.in） |
| `CITY` | 城市 | 否 |

---

## AI DJ 小雨

专业电台 DJ 人设。说话有质感——不说"这是一首治愈系歌曲"，说"钢琴进来的时候，像有人轻轻拍你的肩膀"。偶尔分享冷知识（比如"这首歌的鼓是在厕所录的"），但点到为止，不滥用。

边界明确：只回答音乐相关问题。遇到无关话题，一句话软拉回音乐。

完整人设卡：`apps/server/src/prompts/plan-system.md`
节目示例：`apps/server/src/docs/节目示例.md`

---

## 工程质量

- **Mock-First 架构**：所有外部依赖（LLM、音乐、天气）均有 Mock 实现，无 API Key 也能完整演示
- **三层容错**：天气 3 层回退、JSON 解析 3 层提取、LLM 超时 + 默认歌单兜底
