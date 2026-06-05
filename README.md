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

### 待完成

| 层 | 内容 |
|---|---|
| Frontend | React 播放器 + SSE 流式接收 + 歌曲卡片渲染 |
| Routing | Fastify 路由 + 三层意图分发 + SQLite 数据库 |
| ASR | 语音识别 |
| TTS | GPT-SoVITS 本地语音合成，三种音色（温柔女声/活泼女声/男播音）— 已完成 |

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
