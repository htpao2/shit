# Radare2 MCP - VCP Plugin Adapter

这是 [radare2-mcp](https://github.com/radareorg/radare2-mcp) 的 VCP (Virtual Cherry-Var Protocol) 插件适配器。它允许你在支持 VCP 协议的 AI 代理环境中使用强大的 radare2 逆向工程工具。

## 架构

为了解决 VCP 同步插件“单次调用即退出”导致的 radare2 状态丢失问题，本插件采用适配器模式：

1.  **Wrapper (index.js)**: 轻量级的 Node.js 脚本，作为 VCP 入口，处理协议转换。
2.  **Daemon (r2mcp)**: 常驻后台的二进制服务（由 Wrapper 自动管理），持有分析上下文和 radare2 会话。

## 安装与配置

1.  **编译 r2mcp**:
    在该项目的根目录下运行 `make` 来编译生成 `src/r2mcp` 二进制文件。

2.  **安装 Node.js 依赖**:
    确保你的系统安装了 Node.js（用于运行 Wrapper）。此插件仅使用了原生模块，无需安装三方 npm 包。

3.  **配置 VCP 主服务**:
    在你的 VCP 主服务插件配置中，添加 `vcp-plugin` 目录所在路径。

## 可用指令

-   `open_file`: 打开一个二进制文件开始分析。
-   `list_functions`: 列出二进制文件中的所有函数。
-   `get_disassembly`: 获取指定函数或地址的反汇编代码。
-   `run_command`: 运行原始的 radare2 命令。

## 环境变量

-   `R2MCP_PORT`: 指定后台 Daemon 运行的端口，默认为 `8765`。

## 注意事项

-   首次调用指令时，Wrapper 会自动在后台启动 `r2mcp` 服务。
-   如果分析大文件发现响应变慢，可以尝试增大 `plugin-manifest.json` 中的 `timeout` 设置。
