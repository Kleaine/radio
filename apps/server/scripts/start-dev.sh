#!/bin/bash
# start-dev.sh — 本地开发启动脚本

set -e

echo "🎵 AI DJ 后端服务 - 开发模式启动"
echo "=================================="

# 切换到 server 目录
cd "$(dirname "$0")/.."

# 检查 .env 文件
if [ ! -f .env ]; then
  echo "⚠️  .env 文件不存在，正在从模板创建..."
  cp .env.example .env
  echo "✅ .env 文件已创建，请编辑填入 API Key"
  echo "   vim .env"
fi

# 检查 node_modules
if [ ! -d node_modules ]; then
  echo "📦 正在安装依赖..."
  npm install
fi

# 创建必要目录
mkdir -p ../../data
mkdir -p ../../tts/outputs

# 启动服务
echo "🚀 正在启动服务..."
npm run dev
