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
# 1. 安装依赖（首次）
cd apps/server
npm install
cp .env.example .env
# 编辑 .env，必须填入 DOUBAO_API_KEY

# 2. 启动后端
npx tsx src/index.ts
# → http://localhost:3000

# 3. (可选) QQ音乐扫码登录（才能播放真实歌曲）
cd ../..
python data/qq_login.py
# 用 QQ 扫描生成的二维码图片

# 4. (可选) 启动 TTS 语音服务
cd apps/tts
.\scripts\run_tts_service.ps1
```

浏览器打开 `http://localhost:3000`，注册账号登录后即可使用。

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
│   ├── web/                          ← 前端 PWA 播放器（分工1）
│   │   ├── index.html                ← 主页面
│   │   ├── app.js                    ← 核心逻辑（SSE + 播放队列 + 录音）
│   │   ├── style-v3.css              ← 暗色电台主题
│   │   ├── manifest.json             ← PWA 配置
│   │   └── sw.js                     ← Service Worker
│   │
│   ├── tts/                          ← TTS 语音合成（分工4）
│   │   ├── tts_service/              ← GPT-SoVITS FastAPI 服务
│   │   ├── configs/voices.json       ← 三种音色配置
│   │   ├── assets/voices/            ← 参考音频
│   │   └── scripts/                  ← 安装/启动脚本
│   │
│   └── server/                       ← 后端 API + AI 大脑（分工2+5）
│       ├── src/
│       │   ├── index.ts              ← Express 入口
│       │   ├── services/             ← AI 大脑（分工5）
│       │   │   ├── llm.service.ts    ← 豆包流式调用
│       │   │   ├── context.service.ts← 上下文组装
│       │   │   ├── music.service.ts  ← QQ音乐桥接 + Mock
│       │   │   ├── weather.service.ts← 天气三层回退
│       │   │   ├── calendar.service.ts← 日程读写
│       │   │   ├── memory-writer.ts  ← 偏好自动记录
│       │   │   └── plan-enrich.ts    ← 歌曲补全 + 智能过滤
│       │   ├── routes/               ← HTTP 路由
│       │   │   ├── dispatch.routes.ts← 三层意图分发 + SSE
│       │   │   ├── audio.routes.ts   ← 音频代理 + 预缓存
│       │   │   ├── chat.routes.ts    ← 语音聊天
│       │   │   ├── player.routes.ts  ← 播放控制
│       │   │   ├── auth.routes.ts    ← 登录注册
│       │   │   └── schedule.routes.ts← 飞书日程
│       │   ├── middleware/           ← JWT / 错误 / 响应封装
│       │   ├── db/                   ← SQLite 初始化
│       │   ├── prompts/              ← AI DJ 人设卡
│       │   │   └── plan-system.md
│       │   ├── interface/            ← 跨模块接口
│       │   └── docs/                 ← 架构文档 + 示例
│       ├── docs/                     ← 接口文档 + 启动指南
│       ├── tts/                      ← TTS 音频输出
│       ├── .env.example
│       └── package.json
│
├── data/
│   ├── qq_bridge.py                  ← QQ音乐 Python 桥接
│   ├── qq_login.py                   ← QQ音乐扫码登录
│   ├── qq_credential.json            ← 登录凭证（不提交）
│   ├── schedule.txt                  ← 日程文件
│   └── music/demo.wav                ← 样本音频
│
├── user/
│   ├── taste.md                      ← 音乐品味
│   ├── routines.md                   ← 作息习惯
│   └── mood-rules.md                 ← 情绪规则
│
├── docs/                             ← 项目文档
│   ├── PRODUCT_SPEC_AI_RADIO.md
│   └── DEVELOPMENT_SPEC_AI_RADIO.md
│
└── README.md
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

### 2026-06-07 — @hyd2005

**前端**
- `index.html` — Melodio 品牌重塑，声线选择器移至顶栏，logo 头像
- `app.js` — 播放队列管理 + 歌曲卡片内进度条 + 上一首/下一首导航按钮
- `style-v3.css` — 进度条、导航按钮、播放器控件全套样式
- `logo.jpg` — DJ 头像

**TTS**
- `main.py` — 中英文语言自动检测 + ffmpeg 检查兜底

### 2026-06-06 — @Kleaine

**后端**
- `prompts/plan-system.md` — DJ 人设精炼，从 193 行瘦到 120 行，去掉臃肿规则回归原则
- `routes/audio.routes.ts` — 新建，`/api/audio` 懒加载代理 + URL 预缓存
- `routes/dispatch.routes.ts` — 服务单例懒加载 + AI 完整回复记忆 + 搜索只匹配极简指令（混合意图走AI）
- `routes/player.routes.ts` — 新增 `POST /api/player/report-play` 播歌上报
- `services/plan-enrich.ts` — 并行化 + 三级优先级选歌（录音室>Live）+ 有声书/伴奏完全排除 + 歌名必须匹配不乱放
- `services/context.service.ts` — 25 首黑名单 + Top 10 口味画像 + 天气格式化
- `services/weather.service.ts` — 缓存 30min
- `data/qq_bridge.py` — 新增收藏/歌单/每日推荐拉取接口

**前端**
- `index.html` — 进场问候"我是小雨，你的私人音乐电台 🎧"
- `app.js` — 双模式播放（推荐一次性出卡片 / 电台逐首渲染逐首播）+ 播歌上报

### 2026-06-05

- 弃用 qq-music-api npm，改用 Python qqmusic-api-python 桥接
- QQ 扫码登录，真实播放链接
- 前端 dispatch SSE 流式对接
- 修复 CWD 路径偏移，统一 TTS 端口 8008
