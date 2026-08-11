# OpenKimiPPT VCP Plugin

这是 open-kimi-ppt 的 VCP 同步多命令插件。VCP Agent 负责策划内容、阅读 PPTD 规范并生成 YAML；插件负责受控项目读写、媒体导入、结构校验、图片/PPTX 导出和本地编辑器管理。

## 安装

1. 在仓库根目录运行 `npm run build:vcp`。
2. 将完整的 `vcp-plugin/OpenKimiPPT` 目录复制到 VCP Server 的 `Plugin/OpenKimiPPT`。
3. 按需修改插件目录中的 `config.env`。
4. 重启 VCP Server。
5. 在 Agent 系统提示词中加入 `{{VCPOpenKimiPPT}}`。

`OpenKimiPPT` 目录是自包含插件，必须连同 `resources/` 一起复制。

## 配置

```env
PPT_WORKSPACE_ROOT=./workspace
PPT_MAX_MEDIA_MB=50
PPT_EDITOR_PORT=55173
PPT_PYTHON_COMMAND=python
```

- `PPT_WORKSPACE_ROOT`：插件允许读写的唯一工作根目录。相对路径从插件目录解析，也可配置绝对路径。
- `PPT_MAX_MEDIA_MB`：单个媒体文件大小限制。
- `PPT_EDITOR_PORT`：本地编辑器默认端口。
- `PPT_PYTHON_COMMAND`：Windows 通常为 `python`，macOS/Linux 通常为 `python3`。

## 命令

| 命令 | 用途 |
| --- | --- |
| `CheckEnvironment` | 检查 Node.js、npm、Python、浏览器线索、导出脚本、参考资料和编辑器资源 |
| `CreateProject` | 创建 `.pptd`、`pages/`、`media/` 自包含项目 |
| `ListProjects` | 列出工作根目录中的项目 |
| `GetProjectInfo` | 返回清单、标题、页面和媒体摘要 |
| `ReadManifest` / `WriteManifest` | 读取或写入 PPTD 清单 |
| `ListPages` / `ReadPage` / `WritePage` | 管理 `pages/*.page` |
| `ReadReference` | 读取 `skill`、`pptd`、`slides_categories`、`themes`、`fonts` 或 `shapes` 规范 |
| `ListMedia` / `ImportMedia` | 管理 `media/`；支持本地文件、Base64 和 Data URI |
| `ValidateProject` | 检查 v2 版本、页面引用、资源、基础字段、重复元素 ID 和画布边界 |
| `ExportImages` | 导出逐页图片和 `overview.jpg`，用于视觉质检 |
| `ExportPptx` | 导出可编辑 PPTX，支持淡入淡出转场与字体嵌入选项 |
| `StartEditor` / `EditorStatus` / `StopEditor` | 管理独立后台编辑器服务 |

## 推荐工作流

1. 调用 `CheckEnvironment`。
2. 调用 `ReadReference`，至少读取 `pptd` 与 `slides_categories`。
3. 调用 `CreateProject`。
4. 使用 `WriteManifest` 和 `WritePage` 写入 PPTD v2 内容。
5. 使用 `ImportMedia` 保存本地媒体。
6. 调用 `ValidateProject`，修复所有 `errors`。
7. 调用 `ExportImages`，检查总览图与可疑页面。
8. 调用 `ExportPptx`。
9. 需要人工微调时调用 `StartEditor`。

## 调用示例

```text
<<<[TOOL_REQUEST]>>>
maid:「始」PPTAgent「末」,
tool_name:「始」OpenKimiPPT「末」,
command:「始」CreateProject「末」,
projectPath:「始」quarterly-report「末」,
title:「始」季度经营复盘「末」
<<<[END_TOOL_REQUEST]>>>
```

```text
<<<[TOOL_REQUEST]>>>
maid:「始」PPTAgent「末」,
tool_name:「始」OpenKimiPPT「末」,
command:「始」ExportPptx「末」,
projectPath:「始」quarterly-report「末」,
force:「始」true「末」,
transition:「始」fade「末」
<<<[END_TOOL_REQUEST]>>>
```

## 运行依赖

- Node.js 18+
- npm / npx
- Python 3
- Chromium 系浏览器
- 导出时可访问 `www.kimi.com` 和 `statics.moonshot.cn`

Python 脚本会在缺少时尝试安装 PyYAML、Pillow 和 websocket-client；导出脚本会在缺少或版本过低时尝试安装 `agent-browser`。

## 安全边界

- 项目读写被限制在 `PPT_WORKSPACE_ROOT`。
- 拒绝绝对项目路径、`..` 路径穿越和符号链接逃逸。
- 页面写入仅允许 `pages/*.page`。
- 媒体导入限制扩展名和文件大小。
- `file://` 或本地源文件不存在时，返回 VCP `FILE_NOT_FOUND_LOCALLY` 结构，并携带 `failedParameter: sourcePath`。
- 编辑器只监听 `127.0.0.1`。
- 插件是同步插件，导出超时为 30 分钟；编辑器作为独立后台进程运行，不占用同步调用生命周期。
