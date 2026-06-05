# AI DJ 后端服务

> Node.js + Express + SQLite 后端服务，实现 AI DJ 智能语音助手系统的全部后端功能。

## 快速开始

### 1. 安装依赖

```bash
cd apps/server
npm install
```

### 2. 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，填入 API Key（不填则以 Mock 模式运行）
```

### 3. 启动服务

**Windows:**
```powershell
.\scripts\start-dev.ps1
# 或
.\scripts\start.bat
```

**Linux/Mac:**
```bash
bash scripts/start-dev.sh
# 或
npm run dev
```

服务启动后访问 http://localhost:3000

---

## 项目结构

```
apps/server/
├── src/
│   ├── index.ts              # 入口文件
│   ├── db/
│   │   └── init.ts           # 数据库初始化
│   ├── middleware/
│   │   ├── auth.ts           # JWT 鉴权中间件
│   │   ├── error-handler.ts  # 全局错误处理
│   │   └── response-wrapper.ts # 统一响应封装
│   ├── routes/
│   │   ├── auth.routes.ts    # 账户鉴权（注册/登录）
│   │   ├── feishu.routes.ts  # 飞书 OAuth
│   │   ├── schedule.routes.ts # 日程拉取
│   │   ├── chat.routes.ts    # 语音交互核心
│   │   ├── dispatch.routes.ts # 三层意图分发
│   │   └── player.routes.ts  # 播放器控制
│   ├── scheduler/
│   │   └── index.ts          # 定时任务
│   ├── services/             # 业务逻辑（分工5 提供）
│   └── types/                # 类型声明
├── scripts/                  # 启动脚本
├── docs/                     # 接口文档
├── .env.example              # 环境变量模板
├── package.json
└── tsconfig.json
```

---

## 功能模块

### 1. 账户鉴权
- 注册：bcrypt 加密存储密码
- 登录：JWT Token 鉴权

### 2. 飞书 OAuth
- 获取授权 URL
- 处理 OAuth 回调
- 账户绑定

### 3. 日程管理
- 从飞书同步日程
- 本地日程文件读写

### 4. 语音交互
- ASR 语音识别（对接分工3）
- 上下文组装（时间/天气/日程/用户画像）
- LLM 流式生成播报计划
- TTS 语音合成（对接分工4）

### 5. 三层意图分发
- 第1层：正则指令（播放/暂停/下一首...）
- 第2层：正则搜索（播放周杰伦...）
- 第3层：自然语言 → LLM

### 6. 播放器控制
- 播放/暂停/上下首
- 随机/循环模式
- 播放列表管理

### 7. 定时任务
- 早安电台（每天 07:00）
- 日程同步（每小时）
- 天气缓存预热（每 30 分钟）

---

## 环境变量

| 变量 | 说明 | 必填 |
|------|------|------|
| `PORT` | 服务端口 | 否 (默认 3000) |
| `JWT_SECRET` | JWT 签名密钥 | 否 |
| `DOUBAO_API_KEY` | 豆包 API Key | 否 (不填走 Mock) |
| `QQ_MUSIC_COOKIE` | QQ 音乐 Cookie | 否 (不填走 Mock) |
| `OPENWEATHER_API_KEY` | OpenWeather Key | 否 (不填走 Wttr.in) |
| `CITY` | 城市 | 否 (默认 Beijing) |
| `FEISHU_APP_ID` | 飞书应用 ID | 否 (不填走 Mock) |
| `FEISHU_APP_SECRET` | 飞书应用密钥 | 否 |
| `TTS_SERVICE_URL` | TTS 服务地址 | 否 (默认 http://127.0.0.1:8000) |

---

## 接口文档

详见 [API接口文档.md](./docs/API接口文档.md)

---

## Mock 模式

所有外部依赖（LLM、音乐、天气、飞书）均有 Mock 实现，无 API Key 也能完整演示：

- LLM：返回默认播报计划
- 音乐：返回模拟歌曲列表
- 天气：返回默认天气数据
- 飞书：模拟 OAuth 流程
