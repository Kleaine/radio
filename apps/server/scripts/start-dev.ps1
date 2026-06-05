# start-dev.ps1 — Windows 本地开发启动脚本

$ErrorActionPreference = "Stop"

Write-Host "🎵 AI DJ 后端服务 - 开发模式启动" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan

# 切换到 server 目录
Set-Location "$PSScriptRoot\.."

# 检查 .env 文件
if (-not (Test-Path ".env")) {
  Write-Host "⚠️  .env 文件不存在，正在从模板创建..." -ForegroundColor Yellow
  Copy-Item ".env.example" ".env"
  Write-Host "✅ .env 文件已创建，请编辑填入 API Key" -ForegroundColor Green
  Write-Host "   notepad .env" -ForegroundColor Gray
}

# 检查 node_modules
if (-not (Test-Path "node_modules")) {
  Write-Host "📦 正在安装依赖..." -ForegroundColor Yellow
  npm install
}

# 创建必要目录
New-Item -ItemType Directory -Force -Path "..\..\data" | Out-Null
New-Item -ItemType Directory -Force -Path "..\..\tts\outputs" | Out-Null

# 启动服务
Write-Host "🚀 正在启动服务..." -ForegroundColor Green
npm run dev
