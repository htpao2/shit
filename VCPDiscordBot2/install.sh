#!/bin/bash

echo "================================"
echo "VCPDiscordBot 安装脚本"
echo "================================"
echo ""

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 错误: 未找到 Node.js"
    echo "请先安装 Node.js: https://nodejs.org/"
    exit 1
fi

echo "✅ Node.js 版本: $(node --version)"
echo ""

# 检查 npm
if ! command -v npm &> /dev/null; then
    echo "❌ 错误: 未找到 npm"
    exit 1
fi

echo "✅ npm 版本: $(npm --version)"
echo ""

# 安装依赖
echo "📦 正在安装依赖..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 依赖安装成功！"
else
    echo ""
    echo "❌ 依赖安装失败"
    exit 1
fi

# 检查配置文件
if [ ! -f "config.env" ]; then
    echo ""
    echo "⚠️  未找到 config.env 文件"
    echo "正在从 config.env.example 创建..."
    cp config.env.example config.env
    echo "✅ 已创建 config.env"
    echo ""
    echo "⚠️  请编辑 config.env 文件，填入你的 Discord Bot Token："
    echo "   nano config.env"
    echo ""
else
    echo ""
    echo "✅ config.env 文件已存在"
fi

# 创建数据目录
mkdir -p data
echo "✅ 已创建数据目录"

echo ""
echo "================================"
echo "🎉 安装完成！"
echo "================================"
echo ""
echo "下一步："
echo "1. 编辑 config.env 文件，填入你的 Discord Bot Token"
echo "2. 配置 VCP 主服务器，将此插件添加到 plugin-manifest.json"
echo "3. 启动 VCP 主服务器"
echo ""
echo "测试插件："
echo "  node VCPDiscordBot.js"
echo ""
echo "查看文档："
echo "  cat README.md"
echo ""
