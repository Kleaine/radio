# TTS 本地实现启动说明

## 当前选型

首选方案：GPT-SoVITS。

原因：

- 支持中文 TTS。
- 支持使用参考音频进行零样本/少样本音色迁移。
- 官方提供 WebUI 和 `api_v2.py`，便于本地部署和后端对接。
- 当前本机已有 Python 3.10 和 FFmpeg，满足基础环境要求。

备选方案：

- CosyVoice：中文效果和多语言能力强，但工程依赖更重。
- ChatTTS：适合对话场景，但音色稳定性和可控性不如本项目要求直接。

## 本地目录

- `tts_service/main.py`：课设统一 TTS API，给前端/Node.js 调用。
- `configs/voices.json`：三种音色配置。
- `assets/voices/`：放三种音色的参考音频。
- `outputs/`：合成后的音频输出目录。
- `scripts/setup_gpt_sovits.ps1`：下载并安装 GPT-SoVITS。
- `scripts/run_gpt_sovits_api.ps1`：启动 GPT-SoVITS 原生 API。
- `scripts/run_tts_service.ps1`：启动课设统一 TTS API。
- `examples/synthesize.ps1`：调用示例。

## 第一次安装

```powershell
.\scripts\setup_api_env.ps1
.\scripts\setup_gpt_sovits.ps1 -Device CPU -Source ModelScope
```

如果有 NVIDIA 显卡并已装好 CUDA，可把 `CPU` 改成 `CU126` 或 `CU128`。

## 准备三种参考音频

把 5 到 15 秒、干净、无背景音乐、单人说话的 wav 文件放到：

```text
assets/voices/gentle_female.wav
assets/voices/lively_female.wav
assets/voices/announcer_male.wav
```

对应文本要同步写到 `configs/voices.json` 里的 `prompt_text` 字段。

当前工程也提供占位参考音频生成脚本，使用本机 Windows SAPI 声音生成三段 demo wav：

```powershell
.\scripts\create_demo_reference_audio.ps1
```

这些占位音频只用于打通本地演示闭环。正式答辩前建议替换成真实中文女声/男声数据集音频。

## 启动

先启动 GPT-SoVITS 原生 API：

```powershell
.\scripts\run_gpt_sovits_api.ps1
```

再开一个终端启动课设统一 API：

```powershell
.\scripts\run_tts_service.ps1
```

服务地址：

- 课设统一 API：`http://127.0.0.1:8008`
- GPT-SoVITS API：`http://127.0.0.1:9880`

## 调用示例

```powershell
.\examples\synthesize.ps1 -Voice announcer_male -Text "欢迎收听智能电台，接下来为你播放今日推荐歌曲。"
```

可选音色：

- `gentle_female`
- `lively_female`
- `announcer_male`

三种音色除参考音频不同外，还在 `configs/voices.json` 中配置了 `speed_factor` 和 `postprocess`，用于稳定拉开语速、音调和播报风格差异。

## 给前端/Node.js 的接口约定

请求：

```http
POST /synthesize
Content-Type: application/json
```

```json
{
  "text": "欢迎收听智能电台。",
  "voice": "announcer_male"
}
```

返回：

- 成功：`audio/wav` 音频文件。
- 失败：JSON 错误信息。
