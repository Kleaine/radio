# TTS 模块对接分析

> 分工4（TTS）交付物与分工5（AI Service Layer）的对接
> 2026-06-02

---

## TTS 模块概览

分工4 用 GPT-SoVITS 搭了一个本地 TTS 服务，Python FastAPI，跑在 `localhost:8008`。

接口：

```
POST /synthesize
Body:  { "text": "欢迎收听智能电台。", "voice": "announcer_male" }
返回:  WAV 音频文件

GET  /health    → GPT-SoVITS 是否在线
GET  /voices    → 可用音色列表
```

三种音色：

| id | 描述 |
|---|---|
| `gentle_female` | 温柔女声，语速略慢 |
| `lively_female` | 活泼女声，语速略快 |
| `announcer_male` | 男播音腔，发音清晰 |

---

## 跟分工5 的对接

### 数据怎么走

```
AI DJ 生成播报计划
  items[0] = { type:"tts", text:"早上好，今天阴天...", voice:"gentle_female" }
  items[1] = { type:"song", ... }
  items[2] = { type:"tts", text:"接下来这首...", voice:"lively_female" }
      │
      ▼
plan-enrich.ts 遍历 items
  → 碰到 type:"tts" 的项 → 调 ttsService.synthesize(text, voice)
  → 拿到音频 URL → 存进 ttsAudioUrl
      │
      ▼
分工2 路由层 → SSE 推给前端 → 播放
```

DJ 根据场景选音色：早上温柔女声、白天推荐歌用活泼女声、晚间正式播报用男播音。

### 分工5 要改什么

一共四个地方。

**1. `llm.service.ts` — `PlayableItem` 加 voice 字段**

在 tts 相关字段里加一行：

```typescript
voice?: string;  // gentle_female | lively_female | announcer_male
```

**2. `plan-enrich.ts` — TTS 接口加 voice 参数**

```typescript
// 现在
ttsService?: { synthesize: (text: string) => Promise<string> };

// 改为
ttsService?: { synthesize: (text: string, voice?: string) => Promise<string> };
```

调用时把 `item.voice` 传进去。

**3. `plan-system.md` — 告知 DJ 可选音色**

在 tts 项的字段说明里补充音色信息，让 DJ 知道三个 voice 分别适合什么场景。不填就默认 announcer_male。

**4. `llm.service.ts` `parsePlan` — 保留 voice 字段**

从 LLM 返回的 JSON 中提取 voice，原样写进 `PlayableItem`。

### 不需要分工5 管的

适配层。分工4 返回 WAV 二进制文件，但 `enrichItems` 需要的是一个 URL 字符串。需要一个中间层把 WAV 存本地、生成静态 URL。这件事由分工2 在路由层写，十几行。不属于分工5 也不属于分工4。

串行延迟。一次播报 3-4 段 DJ 串词，`enrichItems` 是 for 循环串行调 TTS，总延迟约 2 分钟。后续可以考虑并行，不急着改。

---

## 分工4 的 TTS 模块需要注意的地方

审查时发现的几个问题，需要分工4 处理：

**参考音频是英文，DJ 说的是中文。** `voices.json` 里三个音色的 `prompt_text` 和 `prompt_lang` 全部是英文。GPT-SoVITS 能跨语言合成，但英文参考音频配中文目标文本，中文的声调和韵律会不够自然。建议用中文录的参考音频做对比测试，看差距多大。

**没有 Mock 模式。** LLM、音乐、天气都有 Mock 兜底，TTS 没有。GPT-SoVITS 没启动或本机没 GPU 时，整个 DJ 是哑巴。应该加一个不调模型也能跑的模式，至少让联调不卡在这里。

**ffmpeg 缺失会崩。** `postprocess_audio` 调 ffmpeg 做音高和语速后处理。如果系统没装 ffmpeg，`subprocess.run` 抛 `FileNotFoundError` 没被捕获，返回 500。

**两组调速参数会叠加。** `speed_factor` 传给 GPT-SoVITS 调一次语速，`postprocess.tempo` 用 ffmpeg 又调一次，两个参数相乘才是最终语速。比如 `lively_female` 的 `speed_factor=1.12` × `tempo=1.1` = 实际 1.23 倍速，比单独哪个都快。需要确认这是设计意图还是疏漏。

**demo 脚本跑不通。** `demo_tts_recording.ps1` 传英文文本，但 `main.py` 里 `text_lang` 写死 `"zh"`。中文模式下合成英文文本，结果不可用。

**脚本都假设从项目根目录启动。** 如果从 `scripts/` 目录右键打开终端运行，所有相对路径都会错。可以用 `$PSScriptRoot` 定位。
