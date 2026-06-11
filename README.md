# 🎧 小雨 — AI 音乐电台

> "我是小雨，你的私人音乐电台。说句话，我陪你听歌。"

小雨是一个本地 AI 音乐电台。结合天气、时间、日程和你的音乐口味，AI DJ 会像真人电台主持人一样串词、选歌、陪你度过一天。

---

## 功能

- **AI DJ 小雨** — 有品味的电台主持人，不说套话，说质感。串词温暖自然，偶尔聊聊歌曲的幕后故事
- **智能选歌** — 综合口味、天气、时段、日程、播放历史七个维度，不是随机播放
- **真实音乐** — 对接 QQ 音乐，搜索真实歌曲并播放
- **语音识别** — Whisper Tiny 做转写 + 标点恢复，说句话就能控制电台
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

# 2. 启动 ASR 语音识别服务（分工3，Python + Whisper Tiny）
cd ../asr
python -m pip install -r requirements.txt
python asr_service.py
# → http://localhost:5000
#   诊断页面: http://localhost:5000/static/diagnostic_plus.html

# 3. 启动后端
cd ../server
npx tsx src/index.ts
# → http://localhost:3000

# 4. (可选) QQ音乐扫码登录（才能播放真实歌曲）
cd ../..
python data/qq_login.py
# 用 QQ 扫描生成的二维码图片

# 5. (可选) 启动 TTS 语音服务
cd apps/tts
.\scripts\run_tts_service.ps1
```

浏览器打开 `http://localhost:3000`，注册账号登录后即可使用。
点击录音按钮说话，AI 会自动识别并回复。

---

## 技术栈

| 层 | 选型 |
|---|---|
| LLM | 豆包（火山引擎），OpenAI SDK，流式 SSE |
| ASR | Whisper Tiny 转写 + `p208p2002/zh-wiki-punctuation-restore`（BERT-base 中文标点恢复，420MB） |
| 音乐 | QQ 音乐 Python 桥接 ([QQMusicApi](https://github.com/L-1124/QQMusicApi)) |
| 天气 | OpenWeatherMap / Wttr.in / Mock 三层回退 |
| 后端 | Express + TypeScript + SQLite |
| 前端 | Vanilla JS + PWA + SSE 流式 + 16kHz WAV 录音 |
| TTS | GPT-SoVITS (Python FastAPI) |

---

## ASR 语音识别

小雨的语音识别是**两步流水线**：

```
麦克风 16kHz WAV
     ↓
Whisper Tiny (语音 → 无标点文本)
     ↓
p208p2002/zh-wiki-punctuation-restore (BERT Token Classification → 插入中文标点)
     ↓
带标点的简体中文文本 → 交给 AI DJ
```

**标点恢复模型：** `p208p2002/zh-wiki-punctuation-restore`
- 基于 BERT-base，训练自中文维基百科语料，约 420MB
- 输出标签：`S-。`、`S-，`、`S-？`、`S-！`、`S-；`、`S-：` 等
- **我们的改进**：用 `offset_mapping` 后处理从原始文本回写英文/数字，解决 BERT `[UNK]` 导致英文丢失的问题

> 🔧 独立诊断页面：启动 ASR 服务后访问 `http://localhost:5000/static/diagnostic_plus.html` 可在主前端之外验证识别效果。

---

## 项目结构

```
radio/
├── apps/
│   ├── web/                          ← 前端 PWA 播放器（分工1）
│   │   ├── index.html                ← 主页面
│   │   ├── app.js                    ← 核心逻辑（SSE + 播放队列 + 16kHz WAV 录音）
│   │   ├── style-v3.css              ← 暗色电台主题
│   │   ├── manifest.json             ← PWA 配置
│   │   └── sw.js                     ← Service Worker
│   │
│   ├── asr/                          ← ASR 语音识别（分工3）
│   │   ├── asr_service.py            ← Whisper + 标点恢复 Flask 服务
│   │   ├── requirements.txt          ← Python 依赖
│   │   └── diagnostic_plus.html      ← 诊断/测试页面（独立于主前端）
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
│       │   │   ├── context.service.ts← 上下文组装（天气/日程/口味/历史）
│       │   │   ├── music.service.ts  ← QQ音乐桥接 + Mock
│       │   │   ├── weather.service.ts← 天气三层回退 + 30min缓存
│       │   │   ├── calendar.service.ts← 日程读写
│       │   │   ├── memory-writer.ts  ← 偏好自动记录
│       │   │   ├── plan-enrich.ts    ← 歌曲补全 + 智能过滤 + 并行
│       │   │   └── profile.service.ts← 动态口味画像（每次播歌更新）
│       │   ├── routes/               ← HTTP 路由
│       │   │   ├── dispatch.routes.ts← 三层意图分发 + SSE + 断连保护
│       │   │   ├── audio.routes.ts   ← 音频代理（透传+302兜底+缓存上限）
│       │   │   ├── chat.routes.ts    ← 语音聊天 + ASR 转发（POST /api/asr）
│       │   │   ├── player.routes.ts  ← 播放控制 + 播歌上报
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
│   ├── profile.json                  ← 动态口味画像（自动累积）
│   ├── last_ai_message.txt           ← AI 记忆（重启不丢）
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
| `ASR_SERVICE_URL` | ASR 服务地址（默认 http://localhost:5000） | 否 |
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
| [ASR 语音识别说明](apps/server/src/docs/ASR说明-分工3.md) | 分工3 |
| [项目架构说明](apps/server/src/docs/项目架构说明-分工5.md) | 分工5 |
| [代码审计报告](apps/server/src/docs/代码审计报告-2026-06-05.md) | 分工5 |
| [意图规则表](apps/server/src/docs/意图规则表-分工5.md) | 分工5 |
| [DJ 人设卡](apps/server/src/prompts/plan-system.md) | 分工5 |
| [TTS 启动指南](apps/tts/docs/TTS_START.md) | 分工4 |

---

## 团队分工

| 分工 | 内容 | 状态 |
|---|---|---|
| 分工1 | 前端 PWA 播放器 | ✅ |
| 分工2 | 后端 API + 数据库 | ✅ |
| 分工3 | ASR 语音识别（Whisper Tiny + 标点恢复，端口 5000） | ✅ |
| 分工4 | TTS 语音合成 | ✅ |
| 分工5 | AI 大脑 + DJ 文案 + 音乐/天气 API | ✅ |

---

## 更新日志

### 2026-06-11 — @pandas520（前端优化）

- `app.js` — 静默请求不创建空白气泡，预取只播不渲染

### 2026-06-11 — @Kleaine（去重+优化）

**去重**
- `dispatch.routes.ts` — 标准化硬过滤：去括号内容、去标点空格后比对历史记录
- 批次内去重：同一批 LLM 推的歌标准化后重复的直接跳过

**Python 路径修正**
- `music.service.ts` / `audio.routes.ts` — 移除硬编码用户路径，改用 `python`/`python3`

**上下文**
- `context.service.ts` — 口味画像 + 推荐策略注入
- `plan-system.md` — 串词 60-100 字

### 2026-06-11 — @Kleaine（ASR 集成与修复）

**ASR 服务接入**
- `apps/asr/asr_service.py` — Whisper Tiny + 标点恢复 Flask 服务（端口 5000），返回 `{status, text, results.{whisper,google}}` 结构
- `apps/asr/diagnostic_plus.html` — 独立诊断页面，用于在主前端之外验证 ASR 识别效果

**前端录音逻辑重构（`apps/web/app.js`）**
- `_recStart` — 增加 `isStarting` 中间状态，防止 `getUserMedia` 异步期间用户重复点击导致并发录音
- `_recStop` — 先清资源（停止麦克风 + 更新 UI），再用 `setTimeout` 异步做重采样/WAV 编码，避免长音频时按钮无响应
- `_resampleLinear` — 新增线性重采样，浏览器 `AudioContext.sampleRate` 不为 16kHz 时自动转换到 16kHz
- `_recSendASR` — 结果字段优先级从 `data.text`/`whisper.text` 改为 `data.results.google.text`（Google 识别 + 独立标点恢复，与 `diagnostic_plus.html` 一致），修复标点错乱/繁体中文问题

**后端 ASR 转发（`apps/server/src/routes/chat.routes.ts`）**
- `performASR` — 用 Node 18+ 内置 `fetch` + `FormData` 替代 `http.request` + `form-data` npm 包
- 结果字段优先级同步前端：优先 `results.google.text` → 顶层 `text` → `results.whisper.text`

---

### 2026-06-07 — @akakwkwk（后端）

- `qq_bridge.py` — 重写搜索，用 SongFileInfo API 适配 qqmusic_api 0.5.x，修复播放链接获取
- `audio.routes.ts` — preWarmUrls 改为逐个查询，兼容新单 mid 接口
- `dispatch.routes.ts` — close 事件改用 res 避免 Windows curl 误触发
- `context.service.ts` — memoryProfile 改名避免与 profile.service 冲突

### 2026-06-07 — @Kleaine（晚间）

**代码审计**
- `app.js` — 清理未使用变量 `_autoContinue`/`_fetchingNext`，SSE 解析去重
- `dispatch.routes.ts` — 清理未使用 import（MockMusicService/PlanResponse/authMiddleware）
- `chat.routes.ts` — 同上
- `music.service.ts` / `audio.routes.ts` — `findPython`/`callBridge` 重复代码标记待提取
- `qq_bridge.py` — `get_fav_songs`/`fav` CLI 未被调用标记待清理
- `player.routes.ts` — 8/9 端点死亡代码标记

**功能修复**
- `dispatch.routes.ts` — 最近播放硬过滤（用户指名要的歌不拦）
- `app.js` — 播放器重构：删复杂状态变量，统一渲染路径
- `app.js` — 静默请求不创建空气泡

### 2026-06-07 — @Kleaine（下午）

**审计修复**
- `chat.routes.ts` — 修复 recentPlays 类型损坏 + 加 topArtists + AI 记忆
- `dispatch.routes.ts` — SSE 断连保护 + recordPlay 接入口味画像
- `audio.routes.ts` — URL 缓存上限 200 条
- `plan-enrich.ts` — 正则提到模块级，避免重复编译
- `llm.service.ts` — items 非数组防御检查
- `scheduler/index.ts` — TTS 文件每小时清理超过 24h 的旧 WAV

**个性化推荐**
- `profile.service.ts` — 新建，动态口味画像：每次播歌累积歌手权重，`user/profile.json` 持久化，profile 空时用 DB topArtists 兜底
- `context.service.ts` — 口味画像 + 70%偏好 30%惊喜推荐策略

**音频代理**
- `audio.routes.ts` — 透传+302 兜底双保险

**前端**
- 卡片等比例微缩 + DJ 头像中间值 + 进度条点击跳转 + 播放暂停切换
- 预生成新计划不再被锁丢弃，改为追加到队列末尾
- 登录页副标题改为"你的私人 AI 音乐电台"

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
