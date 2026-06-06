# Radio — AI 音乐电台

私人 AI 音乐电台。AI DJ 根据时间、天气、日程和用户偏好，生成带有 DJ 串词的电台播报计划，搜索真实 QQ 音乐并播放。

> Status: Alpha — AI + Backend + Frontend complete. Music playback via QQ Music API.
> Express + TypeScript + SQLite + Python Bridge · Mock-First 架构

---

## 项目结构

```
radio/
├── apps/
│   ├── web/                     ← 前端（分工1，已完成）
│   │   ├── index.html           ← 主页面（登录/注册/DJ 交互）
│   │   ├── app.js               ← 核心逻辑（dispatch SSE + 播放队列 + 语音录制）
│   │   ├── style-v3.css         ← 样式（暗色电台主题）
│   │   ├── manifest.json        ← PWA 配置
│   │   └── sw.js                ← Service Worker
│   │
│   ├── tts/                     ← TTS 语音合成（分工4，已完成）
│   │   ├── tts_service/         ← Python FastAPI 服务（GPT-SoVITS）
│   │   ├── configs/voices.json  ← 三种音色配置
│   │   ├── assets/voices/       ← 参考音频
│   │   ├── scripts/             ← 安装/启动脚本
│   │   └── docs/                ← TTS_START.md + 接口文档
│   │
│   └── server/                  ← 后端（分工2+分工5，已完成）
│       ├── src/
│       │   ├── services/        ← AI 大脑 + 外部 API（分工5）
│       │   │   ├── llm.service.ts        ← 豆包流式播报计划
│       │   │   ├── context.service.ts    ← 时间/天气/日程/偏好组装
│       │   │   ├── music.service.ts      ← QQ音乐 Python桥接 + Mock
│       │   │   ├── weather.service.ts    ← 三层回退天气
│       │   │   ├── calendar.service.ts   ← schedule.txt 读写
│       │   │   ├── memory-writer.ts      ← 用户偏好自动记录
│       │   │   └── plan-enrich.ts        ← AI → 真实歌曲补全
│       │   ├── routes/          ← HTTP 路由（分工2）
│       │   ├── middleware/      ← JWT/错误/响应封装（分工2）
│       │   ├── db/              ← SQLite 数据库（分工2）
│       │   ├── scheduler/       ← 定时任务（分工2）
│       │   ├── prompts/         ← AI DJ 人设卡（分工5）
│       │   ├── interface/       ← 跨模块接口（分工5）
│       │   ├── types/           ← 类型声明（分工2）
│       │   └── docs/            ← AI 架构文档 + 示例 + 对接分析（分工5）
│       ├── docs/                ← 后端接口文档 + 启动指南（分工2）
│       ├── scripts/             ← 启动脚本
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
│
├── data/                        ← 运行时数据
│   ├── schedule.txt             ← 日程文件
│   ├── music/demo.wav           ← 样本音频（播放兜底）
│   ├── qq_bridge.py             ← QQ音乐 Python 桥接（搜索+播放链接）
│   ├── qq_credential.json       ← QQ音乐扫码登录凭证（.gitignore 应忽略）
│   └── qq_login.py              ← QQ音乐扫码登录脚本
│
└── user/                        ← 用户画像
    ├── taste.md
    ├── routines.md
    └── mood-rules.md
```

---

## 各分工状态

| 分工 | 状态 | 说明 |
|---|---|---|
| 分工5 AI | 已完成 | 联调时可能需要微调 |
| 分工4 TTS | 已完成 | GPT-SoVITS 本地服务，三种音色 |
| 分工2 后端 | 已完成 | Express + SQLite + SSE 流式 + JWT |
| 分工1 前端 | 已完成 | Vanilla JS + PWA + dispatch SSE + 录音 |
| 分工3 ASR | 待开发 | 当前走 Mock，返回固定文本 |

---

## 技术栈

| 层 | 选型 |
|---|---|
| LLM | 豆包（火山引擎），OpenAI SDK，流式输出 |
| 音乐搜索+播放 | [qqmusic-api-python](https://github.com/L-1124/QQMusicApi)（Python 桥接） |
| 音乐兜底 | Mock + 样本音频 |
| 天气 | OpenWeatherMap / Wttr.in / Mock 三层回退 |
| 后端 | Express + TypeScript + SQLite |
| 前端 | Vanilla JS + PWA + SSE 流式 |
| TTS | GPT-SoVITS (Python FastAPI) |

---

## 快速开始

### 1. 启动后端

```bash
cd apps/server
npm install
cp .env.example .env
# 编辑 .env，填入 DOUBAO_API_KEY
npm run dev
```

### 2. （可选）QQ音乐扫码登录

首次使用需扫码登录一次，凭证有效期至 2026-07-25：

```bash
python data/qq_login.py
# 打开生成的 data/qq_qrcode.png，用 QQ 扫描
```

不登录也能搜到歌名歌手封面，只是播放走样本音频。

### 3. （可选）启动 TTS

```bash
cd apps/tts
# 参考 docs/TTS_START.md 安装 GPT-SoVITS
.\scripts\run_tts_service.ps1
```

### 4. 访问

浏览器打开 `http://localhost:3000`，注册账号，登录。

---

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包 API Key | 是（不填走 Mock） |
| `DOUBAO_MODEL` | 豆包模型名 | 否（默认 doubao-seed-2-0-lite-260215） |
| `TTS_SERVICE_URL` | TTS 服务地址 | 否（默认 http://127.0.0.1:8008） |
| `OPENWEATHER_API_KEY` | OpenWeather Key | 否（不填走 Wttr.in） |
| `CITY` | 城市 | 否（默认 Beijing） |
| `PORT` | 服务端口 | 否（默认 3000） |
| `JWT_SECRET` | JWT 密钥 | 否 |

---

## AI DJ 小雨

专业电台 DJ 人设。说话有质感——不说"这是一首治愈系歌曲"，说"钢琴进来的时候，像有人轻轻拍你的肩膀"。

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
| 代码审计报告 | `apps/server/src/docs/代码审计报告-2026-06-05.md` | 分工5 |

---

## 工程质量

- **Mock-First 架构**：所有外部依赖（LLM、音乐、天气）均有 Mock 实现，无 API Key 也能完整演示
- **三层容错**：天气 3 层回退、JSON 解析 3 层提取、LLM 超时 + 默认歌单兜底
- **Python 桥接**：通过 `qqmusic-api-python` 实现真实 QQ 音乐搜索与播放链接获取

---

## 更新日志

### 2026-06-06
- 音乐服务重写：弃用 `qq-music-api` npm 包（2022年已废弃），改用 Python `qqmusic-api-python` 桥接
- 接入 [L-1124/QQMusicApi](https://github.com/L-1124/QQMusicApi)（2026.6 维护中）
- 支持 QQ 扫码登录获取完整凭证，实现真实歌曲播放链接
- 前端 dispatch SSE 流式对接完成，文字输入 + PlanResponse items[] 播放
- 修复 CWD 路径偏移导致的 prompt/日程/画像静默加载失败
- 统一 TTS 端口为 8008
- 合并文档目录，标注分工
