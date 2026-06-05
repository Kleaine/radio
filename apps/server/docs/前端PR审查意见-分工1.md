# 前端 PR 审查意见

> 分支：`feat/front-player` + `hyd2005-patch-1`
> 审查日期：2026-06-05

---

## 需要修改

### 1. 缺少文本输入和 /api/dispatch 对接

`app.js` 全文零次引用 `dispatch`。目前只接了 `/api/chat`（语音录音 + FormData），没有文字输入框。整个前端只能录音，不能打字发送消息。

`/api/dispatch` 是核心功能——三层意图分发（正则指令/搜索/LLM）、SSE 流式返回、PlanResponse 渲染都在这里。必须补上：
- 文字输入框组件
- `fetch()` + `ReadableStream` 解析 SSE 事件流
- `chunk` 事件逐字渲染
- `done` 事件解析 PlanResponse 的 items[] 序列

注意：不能用 `EventSource`，因为 `/api/dispatch` 是 POST 请求，EventSource 只支持 GET。

### 2. SSE 事件格式处理

`/api/dispatch` 返回的 SSE 事件：

| 事件 | data 格式 | 处理方式 |
|---|---|---|
| `event: chunk` | 纯文本字符串 | 直接追加到聊天气泡，不做 JSON.parse |
| `event: done` | JSON `{ type, ... }` | JSON.parse 后按 type 分发 |

`done` 事件有 4 种子类型：
- `type: "command"` → 指令匹配成功，前端无需额外渲染
- `type: "search"` → 搜索结果列表，渲染歌曲选择卡片
- `type: "plan"` → 播报计划，按 items[] 顺序播放
- `type: "error"` → 处理失败，显示错误提示

### 3. PlanResponse items[] 渲染

items[] 是 song/tts 交替序列：

- `type: "song"` → 渲染歌曲卡片（封面、歌名、歌手、推荐理由），播放 `audioUrl`
- `type: "tts"` → DJ 语音播报，播放 `ttsAudioUrl` 或显示 `text`
- 注意 tts 类型的 `title` 和 `artist` 是空字符串，不要显示
- song 的 `audioUrl` 可能为空（搜索失败），需要"无法播放"的兜底 UI

### 4. `hyd2005-patch-1` 分支：运行时产物误提交

该分支包含 12 个 TTS 生成的 WAV 音频文件。这些是运行时产物，不应进入版本控制。**该分支拒绝合并，直接关闭。**

---

## 做得好的

- PWA 配置完整（`manifest.json` + `sw.js`）
- 语音录制 + `/api/chat` 对接正确（MediaRecorder + FormData + JWT）
- 登录/注册 UI 完整，JWT 存储和过期处理正确
- CSS 有两套风格（style-v2.css / style-v3.css）
- Service Worker 离线缓存已实现

---

## 额外注意

- 如果项目中有 WAV 或音频产物目录，确认 `.gitignore` 已覆盖
- 后端返回的非 SSE 响应都包装在 `{ code, message, data }` 中，取数据前先检查 `code === 200`
- Player 状态目前是服务端单用户内存模式，多用户共用
