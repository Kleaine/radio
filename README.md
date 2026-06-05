# Radio — AI 音乐电台

私人 AI 音乐电台。AI DJ 根据时间、天气、日程和用户偏好，生成带有 DJ 串词的电台播报计划。

> Status: Alpha — AI + Backend complete. Frontend in progress.
> Express + TypeScript + SQLite · Mock-First 架构

---

## 项目结构

```
radio/
├── apps/
│   ├── web/                 ← 前端（React 播放器，目录尚未创建，待开发）
│   ├── tts/                 ← TTS 语音合成（分工4，已完成）
│   │   ├── tts_service/     ← Python FastAPI 服务
│   │   ├── configs/         ← 三种音色配置
│   │   ├── assets/voices/   ← 参考音频
│   │   ├── scripts/         ← 安装/启动脚本
│   │   └── docs/            ← TTS_START.md 启动指南
│   └── server/              ← 后端（分工2+分工5，已完成）
│       ├── src/
│       │   ├── services/    ← AI 大脑 + 外部 API（分工5）
│       │   ├── routes/      ← HTTP 路由（分工2）
│       │   ├── middleware/  ← JWT/错误/响应封装（分工2）
│       │   ├── db/          ← SQLite 数据库（分工2）
│       │   ├── scheduler/   ← 定时任务（分工2）
│       │   ├── prompts/     ← AI DJ 人设卡（分工5）
│       │   ├── interface/   ← 跨模块接口（分工5）
│       │   ├── types/       ← 类型声明（分工2）
│       │   └── docs/        ← AI 架构文档 + 示例 + 对接分析（分工5）
│       ├── docs/            ← 后端接口文档 + 启动指南（分工2）
│       ├── scripts/         ← 启动脚本
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
├── data/                    ← 运行时数据（schedule.txt）
└── user/                    ← 用户画像（taste / routines / mood-rules）
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

| 分工 | 状态 | 说明 |
|---|---|---|
| 分工5 AI | 已完成 | 联调时可能需要微调 |
| 分工4 TTS | 已完成 | 联调时可能需要微调 |
| 分工2 后端 | 已完成 | 联调时可能需要微调 |
| 分工1 前端 | 待开发 | 见下方 |
| 分工3 ASR | 待开发 | 接口未定义，需与分工2 协商注入点 |

#### 分工1 要做什么

- React + Vite + PWA 项目骨架
- SSE 客户端：接收 `chunk` 事件逐字渲染 + `done` 事件解析 PlanResponse
- 播放器组件：按 items[] 顺序播放（tts 语音 → 歌曲 → tts 语音 → 歌曲）
- 歌曲卡片：封面 + 歌名 + 歌手 + AI 推荐理由
- 聊天区：DJ 话术气泡
- 指令输入框 + 语音按钮（预留分工3 ASR 入口）


---

## 技术栈

| 层 | 选型 |
|---|---|
| LLM | 豆包（火山引擎），OpenAI SDK，流式输出 |
| 音乐 | QQ 音乐（qq-music-api + 绿钻 Cookie） |
| 天气 | OpenWeatherMap / Wttr.in / Mock 三层回退 |
| 后端 | Express + TypeScript + SQLite |
| 前端 | React + Vite + PWA |

---

## 快速开始

### 后端服务

```bash
cd apps/server
npm install
cp .env.example .env
# 编辑 .env，填入 API Key（不填则 Mock 模式运行）

# Windows
.\scripts\start-dev.ps1

# Linux/Mac
npm run dev
```

服务启动后访问 http://localhost:3000

### 前端（待开发）

```bash
cd apps/web
npm install
npm run dev
```

---

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `PORT` | 服务端口 | 否（默认 3000） |
| `DOUBAO_API_KEY` | 豆包 API Key | 否（不填走 Mock） |
| `DOUBAO_MODEL` | 豆包模型名 | 否（默认 doubao-lite-128k） |
| `QQ_MUSIC_COOKIE` | QQ 音乐 Cookie | 否（不填走 Mock） |
| `OPENWEATHER_API_KEY` | OpenWeather Key | 否（不填走 Wttr.in） |
| `CITY` | 城市 | 否（默认 Beijing） |
| `TTS_SERVICE_URL` | TTS 服务地址 | 否（默认 http://127.0.0.1:8000） |
| `NODE_ENV` | 运行环境 | 否（默认 development） |
| `CORS_ORIGIN` | 跨域来源 | 否（默认 *） |
| `JWT_SECRET` | JWT 签名密钥 | 否 |
| `FEISHU_APP_ID` | 飞书应用 ID | 否（不填走 Mock） |

---

## AI DJ 小雨

专业电台 DJ 人设。说话有质感——不说"这是一首治愈系歌曲"，说"钢琴进来的时候，像有人轻轻拍你的肩膀"。偶尔分享冷知识（比如"这首歌的鼓是在厕所录的"），但点到为止，不滥用。

边界明确：只回答音乐相关问题。遇到无关话题，一句话软拉回音乐。

完整人设卡：`apps/server/src/prompts/plan-system.md`
节目示例：`apps/server/src/docs/节目示例-分工5.md`

---

## 文档索引

| 文档 | 位置 | 作者 |
|---|---|---|
| 项目架构说明 | `apps/server/src/docs/项目架构说明-分工5.md` | 分工5 |
| API 接口文档 | `apps/server/docs/API接口文档-分工2.md` | 分工2 |
| 后端启动指南 | `apps/server/docs/SERVER_START-分工2.md` | 分工2 |
| 意图规则表 | `apps/server/src/docs/意图规则表-分工5.md` | 分工5 |
| API 协同流程 | `apps/server/src/docs/API协同流程-分工5.md` | 分工5 |
| TTS 对接分析 | `apps/server/src/docs/TTS对接分析-分工5.md` | 分工5 |
| 节目示例 | `apps/server/src/docs/节目示例-分工5.md` | 分工5 |
| TTS 启动指南 | `apps/tts/docs/TTS_START.md` | 分工4 |

---

## 工程质量

- **Mock-First 架构**：所有外部依赖（LLM、音乐、天气）均有 Mock 实现，无 API Key 也能完整演示
- **三层容错**：天气 3 层回退、JSON 解析 3 层提取、LLM 超时 + 默认歌单兜底
