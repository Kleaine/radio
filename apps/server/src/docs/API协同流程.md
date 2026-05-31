# API 协同流程

> 分工5 — 从用户输入到歌曲返回的完整数据流向
> 涉及分工：分工5（AI + API）、分工2（后端路由）、分工1（前端展示）

---

## 完整链路

```
┌─────────────────────────────────────────────────────────────────┐
│                          前端（分工1）                            │
│                                                                  │
│  用户输入框 → 打字 "好累想听点放松的" → 点发送                      │
│       │                                                          │
│       ▼                                                          │
│  POST /api/dispatch  { message: "好累想听点放松的" }               │
│       │                                                          │
│       │  SSE 流式接收：                                            │
│       │  · event: chunk  → data: "好的～"（逐字显示在聊天区）       │
│       │  · event: done   → data: { say, songs[], scene }          │
│       │                      └─ songs[] 渲染成歌曲卡片              │
│       │                      └─ say 替换流式文本（最终版）           │
└───────┼──────────────────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────────────────┐
│                        后端路由（分工2）                            │
│                                                                  │
│  /api/dispatch                                                   │
│       │                                                          │
│       ├─ 第1层：正则指令 → 直接控制播放器，返回                    │
│       ├─ 第2层：正则搜索 → 调 MusicService.search()，返回结果      │
│       │                                                          │
│       └─ 第3层：自然语言 ↓                                        │
│              │                                                   │
│              ├─ contextService.build(message)                     │
│              │   ├─ 天气 → weatherService.getCurrent()             │
│              │   ├─ 日程 → calendarService.getTodayEvents()        │
│              │   ├─ 历史 → DB 查最近播放                           │
│              │   └─ 画像 → memoryWriter.readAll()                  │
│              │                                                   │
│              ├─ llmService.generatePlanStream("manual", message, context, onChunk) │
│              │   ├─ 流式输出文本 → SSE push "chunk" 给前端            │
│              │   └─ 解析 JSON → 返回 PlanResponse                    │
│              │                                                   │
│              ├─ plan-enrich.enrichItems(plan.items, config)          │
│              │   └─ song 项 → musicService.search() 补全真实id/URL   │
│              │                                                   │
│              ├─ 如果有 PlanResponse.memory[]                        │
│              │   └─ memoryWriter.writeAll(memory) → 写入 user/taste.md │
│              │                                                   │
│              ├─ 如果有 PlanResponse.schedule[]                      │
│              │   └─ calendarService.updateEvents(schedule)         │
│              │                                                   │
│              └─ SSE push "done" → PlanResponse JSON 给前端          │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
        │
┌───────┴──────────────────────────────────────────────────────────┐
│                      外部 API（分工5 封装）                         │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐            │
│  │ 豆包 LLM      │  │ QQ 音乐       │  │ 天气          │            │
│  │ (火山引擎)    │  │ (npm 包)      │  │ (三层回退)    │            │
│  │              │  │              │  │              │            │
│  │ llm.service  │  │ music.service │  │ weather.svc  │            │
│  │ · 流式聊天    │  │ · search()   │  │ · 3层回退    │            │
│  │ · JSON 提取   │  │ · getUrl()   │  │ · 缓存       │            │
│  │ · 降级        │  │ · getLyric() │  │              │            │
│  └──────────────┘  └──────────────┘  └──────────────┘            │
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐                              │
│  │ 日程          │  │ 用户画像       │                              │
│  │ (txt 文件)    │  │ (本地 md)      │                              │
│  │              │  │              │                              │
│  │ calendar.svc │  │ memory-writer │                              │
│  │ · 读 txt     │  │ · 追加写入    │                              │
│  │ · LLM 更新   │  │ · 读取汇总    │                              │
│  └──────────────┘  └──────────────┘                              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## SSE 事件格式

前端通过 `EventSource` 或 `fetch` 接收 SSE 事件流：

```
event: chunk
data: 好的～今天

event: chunk
data: 确实有点累了，

event: chunk
data: 给你找几首放松的～

event: done
data: {"summary":"疲劳放松播报","scene":"relax","items":[{"type":"tts","text":"累了的时候，不需要太用力的音乐。"},{"type":"song","title":"旅行的意义","artist":"陈绮贞","reason":"清新治愈"}],"schedule":[],"memory":[]}
```

---

## 各分工的边界

| 谁负责 | 做什么 |
|---|---|
| **分工5** | 提供 `llm.service.ts`、`context.service.ts`、`music.service.ts`、`weather.service.ts`、`calendar.service.ts`、`memory-writer.ts`。每个都带 Mock 实现。 |
| **分工2** | 在 `/api/dispatch` 路由中调用分工5 的服务，处理 SSE 推送、正则分发。需要实现 DB 层（plays 表，给 context 提供"最近播放"数据）。 |
| **分工1** | 前端调用 `/api/dispatch`，接收 SSE 事件，渲染聊天区和歌曲卡片。AI 回复的 JSON 字段名：`summary`、`scene`、`items[].type`（song/tts）、`items[].title`、`items[].artist`、`items[].reason`、`items[].text`。 |

---

## 环境变量

分工2 需要在 `.env` 里配置：

```env
# 豆包（必填）
DOUBAO_API_KEY=ark-xxxxx
DOUBAO_MODEL=doubao-lite-128k

# QQ 音乐（选填，不填走 Mock）
QQ_MUSIC_COOKIE=uin=xxx; qm_keyst=xxx;

# 天气（选填，不填走 Wttr.in）
OPENWEATHER_API_KEY=
CITY=Beijing
```
