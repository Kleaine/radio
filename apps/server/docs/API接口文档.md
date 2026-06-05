# AI DJ 智能语音助手系统 - 接口文档

> 版本：1.0.0
> 基础路径：`http://localhost:3000`

---

## 1. 账户鉴权模块

### 1.1 注册

**POST** `/api/register`

前端将明文账号密码投递给后端，后端在数据库验证去重后，通过 bcrypt 加密哈希化安全存入 users 用户表中。

**请求体：**
```json
{
  "username": "Admin_DJ",
  "password": "MySecPass123"
}
```

**响应：**
- `200` 注册成功
```json
{
  "code": 200,
  "message": "注册成功，用户信息已成功持久化写入数据库",
  "data": null
}
```
- `409` 账户已被占用
```json
{
  "code": 409,
  "message": "注册终止：该账户名称在系统数据库中已被注册"
}
```

---

### 1.2 登录

**POST** `/api/login`

双重核验逻辑：先查 username (无则 404)，再验明文密码 (错则 401)。

**请求体：**
```json
{
  "username": "Admin_DJ",
  "password": "MySecPass123"
}
```

**响应：**
- `200` 登录成功
```json
{
  "code": 200,
  "message": "身份鉴权通过",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "loginAt": "2026-06-03 22:20:00"
  }
}
```
- `404` 账号不存在
```json
{
  "code": 404,
  "message": "登录失败：该管理账号在系统数据库中不存在，请检查输入或先前往注册"
}
```
- `401` 密码错误
```json
{
  "code": 401,
  "message": "登录失败：密码验证不匹配，请重新核对后输入"
}
```

---

## 2. 飞书 OAuth 桥梁

### 2.1 获取飞书授权 URL

**GET** `/api/feishu/auth-url?token=<JWT>`

返回官方拼装好的安全授权 URL。

**响应：**
```json
{
  "code": 200,
  "data": {
    "url": "https://passport.feishu.cn/suite/passthru/oauth/authorize?client_id=cli_mock&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Ffeishu%2Fcallback&response_type=code&state=LOCAL_JWT"
  }
}
```

---

### 2.2 飞书回调

**GET** `/api/feishu/callback?code=<CODE>&state=<JWT>`

飞书服务器官方身份信息重定向回调中转路由。

**响应：**
- `302` 处理完毕，浏览器带着 `bind=success` 参数强制洗回前端主页

---

## 3. 业务协同模块

### 3.1 拉取今日日程

**GET** `/api/schedule`

需要 JWT 鉴权。拉取并清洗当前登录账户的今日飞书日程。

**请求头：**
```
Authorization: Bearer <token>
```

**响应：**
- `200` 成功拉取日程
```json
{
  "code": 200,
  "data": [
    {
      "time": "15:00",
      "content": "[飞书同步] 智能AI电台系统最终答辩会议",
      "active": true
    }
  ]
}
```
- `401` 未绑定飞书
```json
{
  "code": 401,
  "message": "检测到您的本地账户未绑定飞书账号凭证，拒绝同步日历"
}
```

---

### 3.2 语音智能交互

**POST** `/api/chat`

核心流水线：ASR 提取文字 → 组装上下文 → LLM 生成播报计划 → TTS 合成音频 → 返回控制数据链。

**请求头：**
```
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**请求体：**
- `audio` (file): 原始二进制音频切片
- `voice_style` (string): 声线特征码
  - `gentle_female` 温柔女声
  - `lively_female` 活泼女声
  - `announcer_female` 播音女声

**响应：**
```json
{
  "code": 200,
  "message": "success",
  "data": {
    "userText": "帮我看看接下来的日程并放首歌。",
    "replyText": "好的，您下午3点有智能AI电台系统最终答辩会议。现在为您播放精选电音《The Nights》。",
    "audioUrl": "/static/tts_cache/intro_session_9921.mp3",
    "recommendSong": {
      "title": "The Nights",
      "artist": "Avicii",
      "reason": "适配您下午3点的项目答辩会议，用节奏激活灵感。",
      "songUrl": "/static/music_library/the_nights.mp3"
    }
  }
}
```

---

## 4. 三层意图分发（SSE 流式）

### 4.1 意图分发

**POST** `/api/dispatch`

SSE 流式响应。按三层规则分发：指令 → 搜索 → LLM。

**请求体：**
```json
{
  "message": "好累想听点放松的"
}
```

**SSE 事件格式：**
```
event: chunk
data: 好的～

event: chunk
data: 今天确实有点累了，

event: done
data: {"type":"plan","summary":"疲劳放松播报","scene":"relax","items":[...]}
```

---

## 5. 播放器控制

### 5.1 获取播放状态

**GET** `/api/player/status`

### 5.2 播放

**POST** `/api/player/play`

### 5.3 暂停

**POST** `/api/player/pause`

### 5.4 下一首

**POST** `/api/player/next`

### 5.5 上一首

**POST** `/api/player/prev`

### 5.6 随机播放

**POST** `/api/player/shuffle`

### 5.7 循环模式

**POST** `/api/player/repeat`

循环模式切换顺序：关闭 → 单曲循环 → 列表循环 → 关闭

### 5.8 更新播放列表

**POST** `/api/player/playlist`

**请求体：**
```json
{
  "items": [
    {
      "id": "song_001",
      "title": "晴天",
      "artist": "周杰伦",
      "audioUrl": "/static/music/qingtian.mp3"
    }
  ]
}
```

---

## 6. 健康检查

**GET** `/health`

**响应：**
```json
{
  "status": "ok",
  "timestamp": "2026-06-05T10:30:00.000Z"
}
```

---

## 7. 定时任务

| 任务 | 执行时间 | 说明 |
|------|----------|------|
| 早安电台 | 每天 07:00 | 自动生成早安播报计划 |
| 日程同步 | 每小时 | 拉取最新日程数据 |
| 天气预热 | 每 30 分钟 | 缓存天气数据 |

---

## 8. 环境变量

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
