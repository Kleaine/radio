@echo off
REM start.bat — Windows 快速启动脚本

echo 🎵 AI DJ 后端服务 - 开发模式启动
echo ==================================

cd /d "%~dp0\.."

if not exist ".env" (
    echo ⚠️  .env 文件不存在，正在从模板创建...
    copy ".env.example" ".env"
    echo ✅ .env 文件已创建，请编辑填入 API Key
    pause
)

if not exist "node_modules" (
    echo 📦 正在安装依赖...
    call npm install
)

if not exist "..\..\data" mkdir "..\..\data"
if not exist "..\..\tts\outputs" mkdir "..\..\tts\outputs"

echo 🚀 正在启动服务...
call npm run dev
