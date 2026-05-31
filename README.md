# Radio — AI 音乐电台

私人 AI 音乐电台。用户跟 AI DJ 聊天，AI 根据心情、天气、日程推荐歌曲。

> 仓库：`radio`（私有）
> 状态：开发中

---

## 项目结构

```
radio/
├── apps/
│   ├── web/          ← 前端（React 播放器，分工1，待开发）
│   └── server/       ← 后端（Fastify，分工2 + 分工5）
│       └── src/
│           ├── services/   ← 业务逻辑（分工5 已完成）
│           ├── prompts/    ← AI 提示词
│           ├── docs/       ← 文档
│           └── interface/  ← 跨模块接口
├── data/             ← 运行时数据
└── user/             ← 用户画像
```

---

## 当前进度

### 分工5（AI + 外部 API）— 已完成

| 模块 | 文件 | 说明 |
|---|---|---|
| AI 大脑 | `services/llm.service.ts` | 豆包流式调用，JSON 提取，容错降级 |
| 上下文组装 | `services/context.service.ts` | 时间、天气、日程、播放历史拼成 prompt |
| 音乐服务 | `services/music.service.ts` | QQ 音乐搜索/播放/歌词，Mock 双实现 |
| 天气服务 | `services/weather.service.ts` | OpenWeather → Wttr.in → Mock 三层回退 |
| 日程服务 | `services/calendar.service.ts` | schedule.txt 读写，支持 AI 聊天更新 |
| 偏好记忆 | `services/memory-writer.ts` | AI 发现偏好后自动记录到本地 |
| AI 人设 | `prompts/plan-system.md` | DJ 小雨人设卡，含边界规则 |
| 接口定义 | `interface/music.service.interface.ts` | 给分工2 的音乐服务接口 |
| 意图规则 | `docs/意图规则表.md` | 正则三层分发规则 |
| 数据流图 | `docs/API协同流程.md` | 用户输入到歌曲播放完整链路 |
| 架构说明 | `docs/项目架构说明.md` | 全部文件说明和依赖关系 |

### 待完成

| 分工 | 内容 |
|---|---|
| 分工1 | React 前端播放器 |
| 分工2 | Fastify 后端路由、数据库、WebSocket |
| 分工3 | 语音识别（ASR） |
| 分工4 | 语音合成（TTS） |

---

## 技术栈

| 层 | 选型 |
|---|---|
| LLM | 豆包（火山引擎），OpenAI SDK，流式输出 |
| 音乐 | QQ 音乐（qq-music-api + 绿钻 Cookie） |
| 天气 | OpenWeatherMap / Wttr.in |
| 日历 | 本地 schedule.txt |
| 后端 | Fastify + TypeScript + SQLite |
| 前端 | React + Vite + PWA |

---

## 快速开始

```bash
# 1. 克隆仓库
git clone <repo-url> radio
cd radio

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 .env，填入 API Key

# 4. 启动
pnpm dev
```

---

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包 API Key | 是 |
| `QQ_MUSIC_COOKIE` | QQ 音乐 Cookie | 否（不填走 Mock） |
| `OPENWEATHER_API_KEY` | OpenWeather Key | 否（不填走 Wttr.in） |
| `CITY` | 城市 | 否 |

---

## AI DJ 小雨

人设：专业电台 DJ，温暖不油腻。会根据时间、天气、日程和用户偏好推荐歌曲，每首歌都解释推荐理由。

边界：只回答音乐相关问题。遇到编程、时事等无关话题，一句话软拉回音乐，不破坏电台沉浸感。
