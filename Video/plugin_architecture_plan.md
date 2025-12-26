# VCP 视频全流程插件构建规划

基于 `idea.txt` 的创意与 `同步异步插件开发手册.md` 的规范，本规划将视频制作流程拆解为 7 个协同工作的 VCP 插件。

## 1. ScriptDirector (脚本导演)
*   **功能**: 将剧情文字转化为结构化的分镜脚本。
*   **类型**: **同步 (Synchronous)**
*   **技术栈**: Python (调用 LLM API)
*   **输入**: `plot_text` (剧情文本)
*   **输出**: JSON 格式的分镜列表 (包含画面描述、运镜、旁白、提示词)。
*   **关键实现**:
    *   内置专业的 System Prompt (参考 `idea.txt` 中的提示词)。
    *   输出需严格遵循 JSON Schema，方便后续插件解析。

## 2. StoryboardGen (分镜绘图师)
*   **功能**: 根据脚本生成 16:9 的宫格分镜图。
*   **类型**: **异步 (Asynchronous)**
*   **技术栈**: Python (调用 Banana/Midjourney/Flux 等绘图 API)
*   **输入**: `script_json` (分镜脚本), `style_prompt` (风格提示词)
*   **输出**: `image_url` (宫格图 URL)
*   **VCP 特性**:
    *   使用异步回调机制 (`{{VCP_ASYNC_RESULT::...}}`)。
    *   支持 `webSocketPush` 实时通知生成进度。

## 3. ImageSlicer (图片切片器)
*   **功能**: 将宫格图切分为单张分镜图片。
*   **类型**: **同步 (Synchronous)**
*   **技术栈**: Python (Pillow/OpenCV) 或 Node.js (Sharp)
*   **输入**: `grid_image_url` (宫格图路径/URL), `rows` (行数), `cols` (列数)
*   **输出**: `sliced_images` (包含多个图片路径/Base64 的数组)
*   **VCP 特性**:
    *   **超栈追踪 (Hyper-Stack-Trace)**: 必须支持读取远程节点的 `file://` URL，如果本地不存在，抛出 `FILE_NOT_FOUND_LOCALLY` 错误请求主服务获取。

## 4. ImageRefiner (画质精修师)
*   **功能**: 对切分后的低清分镜图进行“图生图”高清重绘或微调。
*   **类型**: **异步 (Asynchronous)**
*   **技术栈**: Python (调用 AI 绘图 API)
*   **输入**: `image_url` (原图), `prompt` (重绘提示词), `strength` (重绘幅度)
*   **输出**: `refined_image_url`
*   **VCP 特性**:
    *   支持批量处理多个分镜图（需处理多文件输入的超栈追踪 `failedParameter` 逻辑）。

## 5. VideoGen (视频生成器)
*   **功能**: 图生视频 (Image-to-Video)。
*   **类型**: **异步 (Asynchronous)**
*   **技术栈**: Python (调用 Sora/Wan2.1/Runway API)
*   **输入**: `image_url` (参考图), `prompt` (运镜提示词), `duration`
*   **输出**: `video_url`
*   **VCP 特性**:
    *   异步任务提交与轮询。

## 6. AudioStudio (音频工作室)
*   **功能**: 生成配音 (TTS) 或进行声音克隆。
*   **类型**: **异步 (Asynchronous)**
*   **技术栈**: Python (调用 Vocu/ElevenLabs/EdgeTTS API)
*   **输入**: `text` (台词), `voice_id` (音色ID), `reference_audio` (克隆参考音频)
*   **输出**: `audio_url`

## 7. VideoEditor (后期剪辑师)
*   **功能**: 将多个分镜视频与音频拼接，处理转场。
*   **类型**: **异步 (Asynchronous)** (因为视频渲染耗时较长)
*   **技术栈**: Python (MoviePy) 或 FFmpeg Wrapper
*   **输入**: `video_clips` (视频片段列表), `audio_tracks` (音频轨道), `transitions` (转场设置)
*   **输出**: `final_video_url`
*   **VCP 特性**:
    *   **复杂的超栈追踪**: 需要从不同节点拉取大量的视频和音频素材，必须健壮处理 `FILE_NOT_FOUND_LOCALLY`。

---

## 开发路线图

1.  **阶段一：核心素材生成**
    *   实现 `ScriptDirector` (文本 -> 脚本)
    *   实现 `StoryboardGen` (脚本 -> 宫格图)
    *   实现 `ImageSlicer` (宫格图 -> 切片)

2.  **阶段二：动态化与音频**
    *   实现 `VideoGen` (切片 -> 视频片段)
    *   实现 `AudioStudio` (文本 -> 音频)

3.  **阶段三：合成与交付**
    *   实现 `VideoEditor` (片段+音频 -> 成品)
    *   (可选) 实现 `ImageRefiner` 优化画质

## 目录结构建议

```
Plugin/
├── ScriptDirector/
│   ├── plugin-manifest.json
│   ├── script_director.py
│   └── prompts.py
├── StoryboardGen/
│   ├── plugin-manifest.json
│   ├── storyboard_gen.py
│   └── config.env
├── ImageSlicer/
│   ├── plugin-manifest.json
│   └── slicer.py
├── VideoGen/
│   ├── plugin-manifest.json
│   ├── video_gen.py
│   └── config.env
...