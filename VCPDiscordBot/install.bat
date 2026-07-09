@echo off
chcp 65001 >nul
echo ================================
echo VCPDiscordBot 安装脚本
echo ================================
echo.

REM 检查 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 Node.js
    echo 请先安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js 版本: %NODE_VERSION%
echo.

REM 检查 npm
where npm >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 错误: 未找到 npm
    pause
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm 版本: %NPM_VERSION%
echo.

REM 安装依赖
echo 📦 正在安装依赖...
call npm install

if %errorlevel% equ 0 (
    echo.
    echo ✅ 依赖安装成功！
) else (
    echo.
    echo ❌ 依赖安装失败
    pause
    exit /b 1
)

REM 检查配置文件
if not exist "config.env" (
    echo.
    echo ⚠️  未找到 config.env 文件
    echo 正在从 config.env.example 创建...
    copy config.env.example config.env >nul
    echo ✅ 已创建 config.env
    echo.
    echo ⚠️  请编辑 config.env 文件，填入你的 Discord Bot Token
    echo.
) else (
    echo.
    echo ✅ config.env 文件已存在
)

REM 创建数据目录
if not exist "data" mkdir data
echo ✅ 已创建数据目录

echo.
echo ================================
echo 🎉 安装完成！
echo ================================
echo.
echo 下一步：
echo 1. 编辑 config.env 文件，填入你的 Discord Bot Token
echo 2. 配置 VCP 主服务器，将此插件添加到 plugin-manifest.json
echo 3. 启动 VCP 主服务器
echo.
echo 测试插件：
echo   node VCPDiscordBot.js
echo.
echo 查看文档：
echo   type README.md
echo.
pause
