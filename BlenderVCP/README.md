# BlenderVCP - Blender VCP 控制器

BlenderVCP 通过 VCP (Virtual Cherry-Var Protocol) 协议连接 Blender，允许 AI 直接交互和控制 Blender 进行 3D 建模、场景创建和操作。

本项目基于 [BlenderMCP](https://github.com/ahujasid/blender-mcp) 改造，将 MCP 协议转换为 VCP 协议，以便集成到 VCPToolBox 系统中。

## 功能特性

- **双向通信**: 通过 Socket 连接将 AI 与 Blender 连接起来
- **对象操作**: 在 Blender 中创建、修改和删除 3D 对象
- **材质控制**: 应用和修改材质和颜色
- **场景检查**: 获取当前 Blender 场景的详细信息
- **代码执行**: 从 AI 在 Blender 中运行任意 Python 代码
- **视口截图**: 捕获 3D 视口的截图
- **PolyHaven 集成**: 下载和应用 HDRI、纹理和模型
- **Sketchfab 集成**: 搜索和下载 Sketchfab 模型
- **Hyper3D Rodin 集成**: 通过文本或图像生成 3D 模型
- **Hunyuan3D 集成**: 腾讯混元 3D 模型生成

## 组件

系统由两个主要组件组成:

1. **Blender 插件 (`addon.py`)**: 在 Blender 中创建 Socket 服务器以接收和执行命令的 Blender 插件
2. **VCP 服务器 (`blender_vcp_server.py`)**: 实现 VCP 协议并连接到 Blender 插件的 Python 脚本

## 安装

### 前提条件

- Blender 3.0 或更新版本
- Python 3.10 或更新版本
- VCPToolBox 服务器

### 安装 Blender 插件

1. 从本目录下载 `addon.py` 文件
2. 打开 Blender
3. 进入 编辑 > 首选项 > 插件
4. 点击 "安装..." 并选择 `addon.py` 文件
5. 勾选 "Interface: Blender MCP" 旁边的复选框以启用插件

### 配置 VCP 插件

1. 将 `config.env.example` 复制为 `config.env`
2. 根据需要修改配置:
   ```env
   BLENDER_HOST=localhost
   BLENDER_PORT=9876
   ```

## 使用方法

### 启动连接

1. 在 Blender 中，转到 3D 视图侧边栏（如果不可见，按 N 键）
2. 找到 "BlenderMCP" 标签
3. 如果需要 PolyHaven 资产，勾选相应选项
4. 如果需要 Sketchfab 资产，输入您的 API 密钥
5. 如果需要 Hyper3D 或 Hunyuan3D，配置相应的 API 密钥
6. 点击 "Connect to MCP server"

### 可用命令

| 命令 | 描述 |
|------|------|
| `GetSceneInfo` | 获取当前场景信息 |
| `GetObjectInfo` | 获取特定对象的详细信息 |
| `GetViewportScreenshot` | 捕获视口截图 |
| `ExecuteBlenderCode` | 执行 Python 代码 |
| `GetPolyhavenStatus` | 检查 PolyHaven 集成状态 |
| `GetPolyhavenCategories` | 获取 PolyHaven 资产类别 |
| `SearchPolyhavenAssets` | 搜索 PolyHaven 资产 |
| `DownloadPolyhavenAsset` | 下载并导入 PolyHaven 资产 |
| `SetTexture` | 应用纹理到对象 |
| `GetSketchfabStatus` | 检查 Sketchfab 集成状态 |
| `SearchSketchfabModels` | 搜索 Sketchfab 模型 |
| `DownloadSketchfabModel` | 下载并导入 Sketchfab 模型 |
| `GetHyper3dStatus` | 检查 Hyper3D 集成状态 |
| `GenerateHyper3dModelViaText` | 通过文本生成 3D 模型 |
| `GenerateHyper3dModelViaImages` | 通过图像生成 3D 模型 |
| `PollRodinJobStatus` | 检查 Hyper3D 任务状态 |
| `ImportGeneratedAsset` | 导入 Hyper3D 生成的资产 |
| `GetHunyuan3dStatus` | 检查 Hunyuan3D 集成状态 |
| `GenerateHunyuan3dModel` | 生成 Hunyuan3D 模型 |
| `PollHunyuanJobStatus` | 检查 Hunyuan3D 任务状态 |
| `ImportGeneratedAssetHunyuan` | 导入 Hunyuan3D 生成的资产 |

### 示例调用

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」BlenderVCP「末」,
command:「始」GetSceneInfo「末」
<<<[END_TOOL_REQUEST]>>>
```

```
<<<[TOOL_REQUEST]>>>
tool_name:「始」BlenderVCP「末」,
command:「始」ExecuteBlenderCode「末」,
code:「始」import bpy
bpy.ops.mesh.primitive_cube_add(location=(0, 0, 0))「末」
<<<[END_TOOL_REQUEST]>>>
```

## 故障排除

- **连接问题**: 确保 Blender 插件服务器正在运行，并且端口配置正确
- **超时错误**: 尝试简化请求或将其分解为更小的步骤
- **PolyHaven 集成**: Claude 有时行为不稳定
- **重启试试**: 如果仍然有连接错误，尝试重启 Blender 和 VCP 服务器

## 技术细节

### 通信协议

系统使用基于 TCP Socket 的简单 JSON 协议:

- **命令** 以 JSON 对象发送，包含 `type` 和可选的 `params`
- **响应** 是包含 `status` 和 `result` 或 `message` 的 JSON 对象

### VCP 协议适配

BlenderVCP 作为 VCP 同步插件运行:
1. 从 `stdin` 读取 JSON 请求
2. 通过 Socket 与 Blender 插件通信
3. 将结果以 JSON 格式输出到 `stdout`

## 限制和安全考虑

- `ExecuteBlenderCode` 命令允许在 Blender 中运行任意 Python 代码，这很强大但也可能危险。在生产环境中谨慎使用。使用前务必保存您的工作。
- PolyHaven 需要下载模型、纹理和 HDRI 图像。如果不想使用它，请在 Blender 中取消勾选相应选项。
- 复杂操作可能需要分解为更小的步骤

## 致谢

本项目基于 [BlenderMCP](https://github.com/ahujasid/blender-mcp) 由 [Siddharth Ahuja](https://x.com/sidahuj) 创建。

## 许可证

遵循原项目的 MIT 许可证。