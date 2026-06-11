# 🎤 语音识别 API (Speech Recognition API)

基于 Whisper 本地模型的语音识别 REST API 服务，可在断网环境下使用，同时支持 Google API 作为备选。

## ✨ 功能特性

- **🔇 离线识别**: 使用 Whisper tiny 模型，完全本地运行，不依赖网络
- **🌐 在线备选**: 网络可用时自动尝试 Google API 增强识别精度
- **📝 智能标点**: 自动为识别结果添加标点符号
- **🎯 多引擎返回**: 同时提供多个引擎的识别结果供选择
- **🖥️ Web 测试界面**: 内置简洁的测试页面，方便调试

## 📦 文件结构

```
sp/
├── speech_api.py        # Flask API 主程序（核心）
├── punctuation.py       # 标点符号处理
├── download_whisper.py  # Whisper 模型下载脚本
├── requirements.txt     # Python 依赖列表
├── index.html           # Web 测试页面
└── models/
    └── whisper-tiny/    # Whisper 模型文件
        ├── model.safetensors
        ├── config.json
        ├── tokenizer.json
        └── ...
```

## 🚀 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 准备 Whisper 模型

如果 `models/whisper-tiny/` 目录下已有模型文件（约 150MB），跳过此步。

否则运行：

```bash
python download_whisper.py
```

### 3. 启动服务

```bash
python speech_api.py
```

启动后看到：
```
正在加载 Whisper 模型...
Whisper 模型加载成功!
API: http://localhost:5000
```

### 4. 使用测试页面

在浏览器打开 **http://localhost:5000/**，上传音频文件即可测试。

---

## 📡 API 接口

### 1. 健康检查

```
GET /health
```

**响应示例:**
```json
{
  "status": "ok",
  "whisper_available": true,
  "google_available": true,
  "message": "语音识别 API 服务运行中"
}
```

### 2. 文件识别

```
POST /recognize/file
Content-Type: multipart/form-data

参数: file - 音频文件 (WAV/MP3/FLAC 等)
```

**请求示例 (Python):**
```python
import requests

url = "http://localhost:5000/recognize/file"
files = {'file': open('audio.wav', 'rb')}
r = requests.post(url, files=files, timeout=60)
result = r.json()

print("识别文本:", result['text'])
```

**请求示例 (cURL):**
```bash
curl -X POST -F "file=@audio.wav" http://localhost:5000/recognize/file
```

**响应示例:**
```json
{
  "status": "ok",
  "text": "这是识别出的中文文本。",
  "audio_duration": 5.2,
  "primary_engine": "whisper",
  "results": {
    "whisper": {
      "text": "这是识别出的中文文本。",
      "raw_text": "这是识别出的中文文本",
      "status": "success",
      "engine": "whisper-local"
    },
    "google": {
      "text": "这是识别出的中文文本。",
      "raw_text": "这是识别出的中文文本",
      "status": "success",
      "engine": "google-api"
    }
  }
}
```

### 3. 实时录音识别（需要麦克风）

```
POST /recognize/live
Content-Type: application/json

{ "duration": 3 }
```

---

## 🎧 支持的音频格式

- **推荐格式**: WAV (16kHz, 单声道, PCM)
- **兼容格式**: MP3、FLAC、OGG、M4A 等（通过 ffmpeg/pydub 自动转换）
- **时长限制**: 0.5 - 60 秒
- **文件大小**: 建议 < 10MB

---

## 🔍 识别引擎说明

| 引擎 | 特点 | 网络要求 | 速度 | 中文精度 |
|------|------|---------|------|---------|
| **Whisper (本地)** | 主引擎，基于 Transformer | ❌ 无需 | ⚡ 快 | ⭐⭐⭐⭐ |
| **Google API (在线)** | 备选引擎，云端识别 | ✅ 需要 | 🚀 快 | ⭐⭐⭐⭐⭐ |

**说明**: Whisper 是 OpenAI 开源的语音识别模型，完全离线运行。
tiny 版本模型文件约 150MB，适合中文语音识别。

---

## ⚙️ 配置说明

- **默认端口**: `5000`
- **监听地址**: `0.0.0.0` (所有网络接口，局域网可访问)
- **模型目录**: `./models/whisper-tiny/` (相对路径，与程序同级)

---

## 🐛 常见问题

**Q: 启动报错找不到 Whisper 模型?**
A: 运行 `python download_whisper.py` 下载模型到 `models/whisper-tiny/`

**Q: 中文识别乱码或编码错误?**
A: 确保终端使用 UTF-8 编码，Python 3.7+ 推荐

**Q: 音频转换失败?**
A: 安装 ffmpeg: `choco install ffmpeg` (Windows) 或 `apt install ffmpeg` (Linux)

**Q: 识别结果为空?**
A: 检查音频时长是否在 0.5-60 秒之间，音频质量是否清晰

---

## 📝 许可证

本项目仅用于学习和研究，Whisper 模型版权归 OpenAI 所有。
