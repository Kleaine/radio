# Radio — AI 音乐电台

私人 AI 音乐电台。AI DJ 小雨根据时间、天气、日程、用户口味和播放历史，生成带有 DJ 串词的电台播报计划，搜索真实 QQ 音乐并播放。

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
│       │   │   ├── context.service.ts    ← 时间/天气/日程/口味/历史组装
│       │   │   ├── music.service.ts      ← QQ音乐 Python桥接 + Mock
│       │   │   ├── weather.service.ts    ← 三层回退天气 + 30min缓存
│       │   │   ├── calendar.service.ts   ← schedule.txt 读写
│       │   │   ├── memory-writer.ts      ← 用户偏好自动记录
│       │   │   └── plan-enrich.ts        ← AI → 真实歌曲补全 + 智能过滤
│       │   ├── routes/          ← HTTP 路由
│       │   │   ├── dispatch.routes.ts    ← 三层意图分发 + SSE 流式
│       │   │   ├── audio.routes.ts       ← 音频代理（懒加载 + 预缓存）
│       │   │   ├── chat.routes.ts        ← 语音聊天路由
│       │   │   └── player.routes.ts      ← 播放器控制
│       │   ├── middleware/      ← JWT/错误/响应封装
│       │   ├── db/              ← SQLite 数据库
│       │   ├── prompts/         ← AI DJ 人设卡（分工5）
│       │   │   └── plan-system.md        ← 小雨人设 + 选歌原则 + 输出格式
│       │   ├── interface/       ← 跨模块接口定义
│       │   ├── types/           ← 类型声明
│       │   └── docs/            ← AI 架构文档 + 示例 + 对接分析（分工5）
│       ├── docs/                ← 后端接口文档 + 启动指南
│       ├── .env.example
│       ├── package.json
│       └── tsconfig.json
│
├── data/                        ← 运行时数据
│   ├── schedule.txt             ← 日程文件
│   ├── music/demo.wav           ← 样本音频（播放兜底）
│   ├── qq_bridge.py             ← QQ音乐 Python 桥接（搜索+播放链接+口味拉取）
│   ├── qq_credential.json       ← QQ音乐扫码登录凭证
│   └── qq_login.py              ← QQ音乐扫码登录脚本
│
└── user/                        ← 用户画像
    ├── taste.md                 ← 音乐品味
    ├── routines.md              ← 作息习惯
    └── mood-rules.md            ← 情绪规则
```

---

## 各分工状态

| 分工 | 状态 | 说明 |
|---|---|---|
| 分工5 AI | 已完成 | LLM + 意图识别 + DJ文案 + 音乐/天气/日历 API |
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

```bash
python data/qq_login.py
```

不登录也能搜到歌名歌手封面，只是播放走样本音频。

### 3. （可选）启动 TTS

```bash
cd apps/tts
.\scripts\run_tts_service.ps1
```

### 4. 访问

浏览器打开 `http://localhost:3000`，注册账号，登录。

---

## 环境变量

| 变量 | 说明 | 必填 |
|---|---|---|
| `DOUBAO_API_KEY` | 豆包 API Key | 是 |
| `DOUBAO_MODEL` | 豆包模型名 | 否 |
| `TTS_SERVICE_URL` | TTS 服务地址 | 否（默认 http://127.0.0.1:8008） |
| `OPENWEATHER_API_KEY` | OpenWeather Key | 否 |
| `CITY` | 城市 | 否 |
| `PORT` | 服务端口 | 否（默认 3000） |
| `JWT_SECRET` | JWT 密钥 | 否 |

---

## AI DJ 小雨

> "我是小雨，你的私人音乐电台。说句话，我陪你听歌。"

专业电台 DJ 人设。有阅历、有品味、不赶时间。说话像跟老朋友分享刚发现的好东西。不说"这是一首治愈系歌曲"，说"钢琴进来的时候，像有人轻轻拍你的肩膀"。

完整人设卡：`apps/server/src/prompts/plan-system.md`

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

## 更新日志

### 2026-06-06（分工5 AI 服务层深度优化） — @Kleaine

**DJ 人设与文案质量**
- 重写 plan-system.md 人设卡：明确"小雨"第一人称 DJ 视角，多用"我"、"我们"、"陪你"、"一起"等 DJ 陪伴感语言
- 修正开场白与串词重复问题：开场白只做寒暄不介绍歌曲，串词专注音乐本身，职责彻底分开
- 开场白 2-5 句自由发挥，融入日程、时段、天气感受而非播报数据
- 新增选歌多维原则：综合口味、天气、时段、日程、历史、场景七个维度选歌，而非随机推荐
- 新增风格多样性规则：新老交替、偶尔惊喜、风格过渡自然、不套路
- 新增 5 组参考范例（雨天/深夜/冷知识/lofi/日程融合/陪伴感），给 LLM 明确的语感参照

**性能优化**
- 播放链接懒加载：新增 `/api/audio?mid=xxx` 代理端点，enrich 阶段不再阻塞取 URL，响应速度大幅提升
- URL 预缓存机制：enrich 完成后后台批量预取所有播放链接，点播时缓存命中秒出
- enrich 并行化：TTS 合成 + 歌曲搜索从串行改为 Promise.all 并行，等待时间从累加降为取最慢
- 天气缓存从 5 分钟延长到 30 分钟，修复每次请求重建 service 导致缓存失效的 bug
- 服务单例懒加载：修复模块初始化时 dotenv 未加载导致 API Key 为空的 401 错误

**搜索精准度**
- 新增 Live/现场/翻唱/有声书/播客/小说/广播剧/儿歌等 20+ 关键词过滤，排除非音乐内容
- 歌手名强制参与搜索关键词，避免"沙滩"匹配到洛克王国等无关结果
- 搜索结果按歌手名+歌名双重验证匹配，优先取完全匹配的正式版
- 中英文括号统一化处理，解决 QQ 音乐括号格式不一致导致的漏匹配

**上下文与记忆**
- 新增用户常听歌手 Top 10 口味画像，从播放历史自动统计
- 最近播放防重复从 10 首增加到 25 首，明确标注"不要再推荐这些歌"
- 新增 AI 回复记忆机制：记录最近 5 次回复摘要，下次对话时避免重复话题
- 天气信息格式优化：标注"仅供参考，不需要每次都提天气"，避免 LLM 机械复读温度数字

**QQ 音乐桥接**
- 新增收藏歌曲、自建歌单、收藏歌单、每日推荐等口味数据拉取接口
- 新增 `pull_all_taste()` 一键拉取全部口味档案

**前端配合**
- 进场问候语从"验证通过！语音交互智能AI系统已就绪"改为"我是小雨，你的私人音乐电台"
- 开场白与串词渲染分离，避免 DJ 文字重复显示

---

### 2026-06-05
- 音乐服务重写：弃用 qq-music-api npm 包（2022年已废弃），改用 Python qqmusic-api-python 桥接
- 接入 [L-1124/QQMusicApi](https://github.com/L-1124/QQMusicApi)
- 支持 QQ 扫码登录获取完整凭证，实现真实歌曲播放链接
- 前端 dispatch SSE 流式对接完成
- 修复 CWD 路径偏移导致的 prompt/日程/画像静默加载失败
- 统一 TTS 端口为 8008
