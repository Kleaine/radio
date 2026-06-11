# AI 音乐电台 — 自动语音识别（ASR）模块说明

> 阅读对象：全组成员，特别是分工2（后端路由集成）和分工1（前端录音）
> 阅读时间：10 分钟
> 负责：分工3（ASR 语音识别 + 标点恢复）

---

## 一、一句话总结

**用户说话 → 浏览器录音（WAV 格式）→ 上传到 Node 后端 → 转发给 Python ASR 服务 → Whisper 识别 + 标点恢复 → 返回文字给前端输入框 → 用户点击发送 → AI 回复**

ASR 模块的核心价值：把用户的声音变成文字，让用户能"说"而不是"打字"。

---

## 二、为什么这样设计

### 2.1 为什么用独立的 Python 服务，不直接在 Node 里做？

两种方案对比：

| 方案 | 优点 | 缺点 |
|------|------|------|
| **Node.js 直接调 Whisper JS 库** | 少一个进程，部署简单 | Whisper JS 性能差、精度低、不支持中文标点恢复 |
| **Python Flask 服务 + transformers 库** | 官方 Whisper Tiny 中文精度好、支持标点恢复、生态成熟 | 需要额外启动一个进程 |

**选择 Python 独立服务的决定性原因**：
1. Whisper 官方实现（HuggingFace `transformers`）中文识别精度远高于 JS 版本
2. 标点恢复（`punctuation.py`）需要中文 NLP 库，Python 生态是唯一选择
3. `soundfile` 库读取 WAV/MP3，`pydub` 格式转换，Python 有完整音频处理链

---

### 2.2 为什么前端录 WAV 而不是 WebM？

| 格式 | 谁支持 | 需要 ffmpeg？ | ASR 服务读取 |
|------|--------|---------------|-------------|
| WebM (Opus) | Chrome/Firefox 原生，文件小 | **需要**（Python 不能直接读） | 依赖外部工具 |
| WAV (PCM 16-bit) | 所有浏览器，需编码 7KB/s | **不需要** | `soundfile.read()` 直接读 |

**经验教训（2026-06-11）**：开发环境常未装 ffmpeg。最初前端发送 WebM → ASR 服务依赖 ffmpeg 转换 → ffmpeg 未安装 → Whisper 收到空音频 → 返回空文本 → 前端显示"未能识别出语音内容"。**改用 WAV 后，零外部依赖，任何 Python 环境都能正常工作。**

---

## 三、目录结构

```
apps/asr/                    ← 分工3 核心交付目录
├── speech_api.py            ← Flask 服务入口（5000 端口）
├── punctuation.py           ← 中文标点恢复模块
├── download_whisper.py      ← 下载 Whisper Tiny 模型
├── requirements.txt         ← Python 依赖
├── models/
│   └── whisper-tiny/        ← Whisper Tiny 模型（约 39MB）
│       ├── config.json
│       ├── preprocessor_config.json
│       ├── model.safetensors
│       └── ...
└── diagnostic_plus.html     ← ASR 服务调试页面（浏览器打开测试）

数据流向：
  前端 (app.js) → WAV Blob
     ↓ POST /api/asr (multipart/form-data)
  Node.js 后端 (chat.routes.ts)
     ↓ POST http://localhost:5000/recognize/file
  Python ASR 服务 (speech_api.py)
     ↓ Whisper Tiny 推理 + 标点恢复
  识别结果（JSON）原路返回
```

---

## 四、核心组件详解

### 4.1 Whisper Tiny 模型

**一句话**：OpenAI 开源的语音识别模型，tiny 版本约 39MB，中文识别够用。

- **模型类型**：`whisper-tiny`，39M 参数
- **输入要求**：16kHz 单声道 PCM 音频
- **输出**：纯文本（无标点）
- **为什么 tiny 版**：速度快（CPU 推理 3 秒音频 ≈ 2-3 秒），中文日常对话精度足够，模型文件小不占空间
- **部署方式**：本地加载（`from_pretrained('models/whisper-tiny')`），不依赖外部 API，离线可用

---

### 4.2 标点恢复（`punctuation.py`）

**一句话**：Whisper 输出的中文没有标点（"播放周杰伦的歌"），这一步给它补上标点（"播放周杰伦的歌。"）。

这是分工3 的原创模块。实现了：
- 基于规则的标点恢复（句末加句号，疑问词后加问号，动词后加逗号等）
- Whisper 原始文本 → `add_punctuation(text)` → 带标点文本

**为什么需要**：如果不加标点，AI 大模型收到"播放周杰伦的歌推荐几首类似的"会理解成一句话，可能返回错误结果。加标点后变成"播放周杰伦的歌。推荐几首类似的？"语义清晰。

---

### 4.3 Flask 服务（`speech_api.py`）

**启动命令**：
```bash
cd apps/asr
python speech_api.py
# 默认监听 http://localhost:5000
```

**启动流程**：
1. 检查 `models/whisper-tiny/` 目录是否存在
2. 加载 Whisper 模型（约 2-5 秒）
3. 启动 Flask 服务器，等待上传

**HTTP 接口**（分工2 和分工1 需要对接）：

| 方法 | 路径 | 参数 | 返回 | 谁调用 |
|------|------|------|------|--------|
| GET | `/health` | 无 | `{ status, whisper_available, mic_available, message }` | 健康检查、调试 |
| POST | `/recognize/file` | `file` (multipart/form-data) | `{ status, text, audio_duration, results: { whisper, google } }` | Node 后端 |
| GET | `/` | 无 | `diagnostic_plus.html` 调试页面 | 浏览器手动测试 |

**接口返回示例（成功）**：
```json
{
  "status": "ok",
  "audio_duration": 3.0,
  "text": "播放周杰伦的歌。",
  "results": {
    "whisper": {
      "text": "播放周杰伦的歌。",
      "raw_text": "播放周杰伦的歌",
      "status": "success",
      "engine": "whisper-local"
    },
    "google": {
      "text": "播放周杰伦的歌。",
      "raw_text": "播放周杰伦的歌",
      "status": "success",
      "engine": "whisper-local-via-google-field"
    }
  }
}
```

**接口返回示例（未识别）**：
```json
{
  "status": "ok",
  "audio_duration": 2.1,
  "text": "",
  "results": {
    "whisper": {
      "status": "error",
      "message": "未能识别出内容"
    }
  }
}
```

**音频处理流程**（`speech_api.py` 内部）：
```
收到 file (WAV Blob, ~10-60KB)
  ↓
写入临时文件 (tempfile.mkdtemp)
  ↓
soundfile.read() → numpy array + sample rate
  ↓
sample rate 不是 16000？→ resample 到 16kHz
  ↓
Whisper 推理 → 纯文本（无标点）
  ↓
add_punctuation(text) → 带标点文本
  ↓
返回 JSON 结果
```

---

## 五、与分工2 后端的对接

**对接位置**：`apps/server/src/routes/chat.routes.ts` 中的 `performASR()` 函数

**后端转发流程**：
```
1. 前端 POST /api/asr，上传 audio (WAV Blob)
   └─ multer 中间件 → req.file.buffer (字节数组)

2. performASR(audioBuffer, "audio/wav")
   └─ 用 form-data npm 包构造 multipart/form-data 请求
      form.append("file", buffer, {
        filename: `voice_${Date.now()}.wav`,
        contentType: "audio/wav"
      })
   └─ Node.js http.request 流式 POST 到 http://localhost:5000/recognize/file
   └─ 接收 JSON 响应，提取 text 字段

3. 返回给前端：{ code: 200, data: { text: "..." } }
```

**关键实现细节**：
- **不要手动拼 multipart boundary**。用 `form-data` 包：`npm install form-data`
- **form-data 的正确用法**（`chat.routes.ts:96-145`）：
  ```typescript
  import FormData from "form-data";
  import http from "http";

  const form = new FormData();
  form.append("file", audioBuffer, {
    filename: `voice_${Date.now()}.wav`,
    contentType: mimeType || "audio/wav"
  });

  // form.pipe(http.request) —— 标准流式上传
  ```
- **环境变量**：`ASR_SERVICE_URL`（默认 `http://localhost:5000`）
- **错误日志**：`[asr]` 前缀，Node 控制台可直接追踪

---

## 六、与分工1 前端的对接

**对接位置**：`apps/web/app.js`，录音 + 上传逻辑

**前端录音流程**：
```
用户点击 record-btn
  ↓
navigator.mediaDevices.getUserMedia({
  audio: { echoCancellation: true, sampleRate: 16000, ... }
})
  ↓
AudioContext (16kHz) + ScriptProcessor 捕获 PCM 样本
  ↓
停止录音 → 合并样本 → 手动编码 WAV (RIFF/WAVE header + PCM)
  ↓
fetch('/api/asr', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}` },
  body: FormData(audio_wav_blob)
})
  ↓
收到 text → 填入输入框，让用户点击发送
```

**关键实现细节**：
- **用 WAV，不用 WebM**（见 2.2 节）
- **WAV 编码器手写**（`app.js: _wavEncode()`）：
  - 44 bytes RIFF/WAVE header + 16-bit PCM samples
  - 单声道、16kHz（与 Whisper 输入一致，无需后端 resample）
- **录音时长建议**：1-10 秒。过短 < 0.5s → Whisper 无法识别；过长 > 10s → 推理慢
- **录音状态机**：`idle → starting → recording`，防止快速点击导致状态混乱
- **鉴权**：每次上传都要带 `Authorization: Bearer <token>`，和其他 API 一样

**预期日志（浏览器 F12 Console）**：
```
[录音] 开始录音 (16kHz WAV)
[录音] 停止录音，样本数: 48000
[录音] 生成 WAV: 96044 bytes, sampleRate: 16000
[录音] 发送音频: 96044 bytes, WAV格式
[ASR] 响应: { code: 200, data: { text: "播放周杰伦的歌。" } }
```

---

## 七、环境依赖

### Python 依赖

```bash
pip install flask flask-cors soundfile numpy
pip install transformers torch  # 仅 Whisper 需要
```

或：
```bash
pip install -r apps/asr/requirements.txt
```

### Whisper 模型

首次使用前下载模型（约 39MB，需联网一次）：
```bash
cd apps/asr
python download_whisper.py
# 会创建 apps/asr/models/whisper-tiny/ 目录
```

### 不依赖 ffmpeg

**这是 2026-06-11 修复的关键点**：前端直接输出 WAV，ASR 服务用 `soundfile.read()` 即可读取，不再需要 ffmpeg。如果用户上传的是其他格式（WebM、MP3），ASR 服务仍会尝试用 ffmpeg 转换，但当前前端不发送这些格式。

---

## 八、常见问题 FAQ

### Q1: 启动后浏览器控制台 401 "未提供有效的认证令牌"？
A: 正常。需要先登录获取 JWT token。登录后 `localStorage.getItem('dj_auth_token')` 有值即可。

### Q2: Node 控制台显示 `[asr] 调用失败`？
A: ASR 服务未启动。检查：
```bash
curl http://localhost:5000/health
# 应返回 {"status": "ok", "whisper_available": true, ...}
# 如果 Connection refused → 启动 ASR 服务
```

### Q3: 返回文本是空字符串？
A: 检查录音时长。< 0.5s 太短 Whisper 识别不到。建议用户对着麦说 2-3 秒。

### Q4: Whisper 识别精度不够？
A: 有三条优化路径：
1. 换成 `whisper-base`（74MB）或 `whisper-small`（244MB）模型，精度更高但更慢
2. 前端录音时加噪声抑制和自动增益控制（已加，见 `getUserMedia` 参数）
3. 用户说话时离麦克风近一些

### Q5: 可以离线使用吗？
A: **完全可以**。Whisper 模型是本地加载的，整个 ASR 链路不依赖任何外部 API。

---

## 九、与其他分工的契约

| 项 | 分工1（前端） | 分工2（后端） | 分工3（ASR） | 分工5（AI） |
|----|--------------|--------------|-------------|------------|
| 录音格式 | 输出 WAV (16kHz, mono, 16-bit) | 透传 buffer | 接收 WAV → Whisper 推理 | 不需要 |
| HTTP 接口 | POST `/api/asr` | 接收 → 转发 → 返回 | `http://localhost:5000/recognize/file` | 接收识别后的文字 |
| 返回格式 | 期望 `{ code: 200, data: { text: string } }` | 调用 `performASR()`，包装成统一响应 | `{ status: "ok", text: string, results: {...} }` | 不需要 |
| 鉴权 | 带 JWT token | 验证 token | 不需要 | 不需要 |
| 错误处理 | 显示 "语音识别服务未就绪" 但仍可打字 | 捕获异常，降级返回可编辑文本 | 空文本返回 `"未能识别出语音内容"` | 不需要 |

---

## 十、关键文件索引

| 文件 | 职责 | 阅读时间 |
|------|------|---------|
| `apps/asr/speech_api.py` | ASR Flask 服务主文件 | 5 min |
| `apps/asr/punctuation.py` | 中文标点恢复模块 | 5 min |
| `apps/server/src/routes/chat.routes.ts` | 后端 `/api/asr` 路由 + `performASR()` | 10 min |
| `apps/web/app.js` | 前端录音 + WAV 编码 + 上传 | 10 min |

> **2026-06-11 更新**：修复"录音再点击无法停止" + "ASR 永远返回空文本"两大问题。核心改动：前端改用 WAV 格式（无需 ffmpeg），后端用 `form-data` 包正确构造 multipart 请求，录音逻辑改用状态机管理。
