import sys
import json
import os
import threading
import time
import requests
import uuid

def poll_and_callback(request_id, script_data, style_prompt, callback_base_url, plugin_name):
    """
    后台线程：模拟调用绘图 API 并回调结果。
    """
    try:
        # 模拟绘图耗时
        time.sleep(10) 
        
        # 这里应该是实际调用 Banana/Flux 等 API 的逻辑
        # 构造提示词：将脚本中的 prompt 拼接成宫格图请求
        prompts = [item.get('prompt', '') for item in script_data]
        combined_prompt = f"Professional movie storyboard, 16:9 grid layout, no gaps, consistent characters and style. Style: {style_prompt}. Scenes: " + " | ".join(prompts)
        
        # 模拟成功结果
        # 在实际开发中，这里会获取到生成的图片 URL
        result_payload = {
            "requestId": request_id,
            "status": "Succeed",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": f"分镜宫格图 (ID: {request_id}) 已生成成功。"
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": "https://example.com/generated_storyboard.png" # 占位符
                        }
                    }
                ]
            }
        }

        # 发送回调
        callback_url = f"{callback_base_url}/{plugin_name}/{request_id}"
        requests.post(callback_url, json=result_payload, timeout=30)

    except Exception as e:
        # 失败回调
        error_payload = {
            "requestId": request_id,
            "status": "Failed",
            "error": str(e)
        }
        callback_url = f"{callback_base_url}/{plugin_name}/{request_id}"
        requests.post(callback_url, json=error_payload, timeout=30)

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return
        
        args = json.loads(input_data)
        script_data = args.get("script_data")
        style_prompt = args.get("style_prompt", "Realistic movie style")
        
        if not script_data:
            print(json.dumps({"status": "error", "error": "Missing script_data parameter."}))
            return

        # 生成唯一任务 ID
        request_id = str(uuid.uuid4())
        
        # 获取回调环境变量
        callback_base_url = os.getenv("CALLBACK_BASE_URL")
        plugin_name = os.getenv("PLUGIN_NAME_FOR_CALLBACK")

        if callback_base_url and plugin_name:
            # 启动后台线程
            thread = threading.Thread(target=poll_and_callback, args=(
                request_id, script_data, style_prompt, callback_base_url, plugin_name
            ))
            thread.start()

            # 立即返回占位符给 AI
            result_string = (
                f"分镜宫格图生成任务 (ID: {request_id}) 已提交。\n"
                f"这是一个动态上下文占位符，当图片生成完成时，它会被自动替换为实际结果。\n"
                f"请在你的回复中包含以下占位符原文：{{{{VCP_ASYNC_RESULT::StoryboardGen::{request_id}}}}}"
            )
            print(json.dumps({"status": "success", "result": result_string}))
        else:
            print(json.dumps({"status": "error", "error": "Missing callback environment variables."}))

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    main()