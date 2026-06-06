# 🎧 小雨 — AI 音乐电台

> "我是小雨，你的私人音乐电台。说句话，我陪你听歌。"

小雨是一个本地 AI 音乐电台。结合天气、时间、日程和你的音乐口味，AI DJ 会像真人电台主持人一样串词、选歌、陪你度过一天。

---

## 功能

- **AI DJ 小雨** — 有品味的电台主持人，不说套话，说质感。串词温暖自然，偶尔聊聊歌曲的幕后故事
- **智能选歌** — 综合口味、天气、时段、日程、播放历史七个维度，不是随机播放
- **真实音乐** — 对接 QQ 音乐，搜索真实歌曲并播放
- **TTS 语音** — DJ 串词通过 GPT-SoVITS 合成语音播报
- **三层意图识别** — 播放指令 / 歌曲搜索 / 自然语言聊天，自动分流

---

## 快速开始

```bash
# 1. 后端
cd apps/server
npm install
cp .env.example .env   # 编辑填入 DOUBAO_API_KEY
npm run dev             # → http://localhost:3000

# 2. (可选) QQ音乐登录
python data/qq_login.py

# 3. (可选) TTS 语音
cd apps/tts
.\scripts\run_tts_service.ps1
```

浏览器打开 `http://localhost:3000`，注册登录即可使用。

---

## 技术栈

| 层 | 选型 |
|---|---|
| LLM | 豆包（火山引擎），OpenAI SDK，流式 SSE |
| 音乐 | QQ 音乐 Python 桥接 ([QQMusicApi](https://github.com/L-1124/QQMusicApi)) |
| 天气 | OpenWeatherMap / Wttr.in / Mock 三层回退 |
| 后端 | Express + TypeScript + SQLite |
| 前端 | Vanilla JS + PWA + SSE 流式 |
| TTS | GPT-SoVITS (Python FastAPI) |

---

## 项目结构

```
radio/
├── apps/
│   ├── web/          ← 前端（PWA 播放器）
│   ├── tts/          ← TTS 语音合成
│   └── server/       ← 后端（API + AI 大脑）
│       └── src/
│           ├── services/    ← LLM / 音乐 / 天气 / 日历 / 偏好记忆
│           ├── routes/      ← dispatch / audio / chat / player
│           └── prompts/     ← AI DJ 人设卡
├── data/             ← QQ 音乐桥接 + 日程 + 样本音频
└── user/             ← 用户画像（口味 / 作息 / 情绪规则）
```

---

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包 API Key | 是 |
| `DOUBAO_MODEL` | 模型名 | 否 |
| `TTS_SERVICE_URL` | TTS 地址 | 否 |
| `OPENWEATHER_API_KEY` | 天气 API Key | 否 |
| `CITY` | 城市 | 否 |
| `PORT` | 端口 | 否（3000） |

---

## 文档

| 文档 | 作者 |
|---|---|
| [API 接口文档](apps/server/docs/API接口文档-分工2.md) | 分工2 |
| [后端启动指南](apps/server/docs/SERVER_START-分工2.md) | 分工2 |
| [项目架构说明](apps/server/src/docs/项目架构说明-分工5.md) | 分工5 |
| [意图规则表](apps/server/src/docs/意图规则表-分工5.md) | 分工5 |
| [DJ 人设卡](apps/server/src/prompts/plan-system.md) | 分工5 |
| [TTS 启动指南](apps/tts/docs/TTS_START.md) | 分工4 |

---

## 团队分工

| 分工 | 内容 | 状态 |
|---|---|---|
| 分工1 | 前端 PWA 播放器 | ✅ |
| 分工2 | 后端 API + 数据库 | ✅ |
| 分工3 | ASR 语音识别 | 🚧 |
| 分工4 | TTS 语音合成 | ✅ |
| 分工5 | AI 大脑 + DJ 文案 + 音乐/天气 API | ✅ |

---

## 更新日志

### 2026-06-06 — @Kleaine

- **DJ 人设重写**：小雨第一人称视角，开场白/串词分离，七维选歌决策，多样性原则
- **性能优化**：`/api/audio` 懒加载 + 预缓存，enrich 并行化，天气缓存 30min，服务单例修复
- **搜索精准度**：20+ 非音乐过滤，歌手名强制搜索，歌手+歌名双重匹配，括号统一化
- **上下文增强**：25 首防重复，Top 10 口味画像，AI 回复记忆
- **进场问候**："我是小雨，你的私人音乐电台"

### 2026-06-05

- 弃用 qq-music-api npm，改用 Python qqmusic-api-python 桥接
- QQ 扫码登录，真实播放链接
- 前端 dispatch SSE 流式对接
- 修复 CWD 路径偏移，统一 TTS 端口 8008
