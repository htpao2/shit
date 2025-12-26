import sys
import json
import os
import threading
import time
import requests
import uuid

def poll_and_callback(request_id, image_url, image_base64, prompt, duration, callback_base_url, plugin_name):
    try:
        # 模拟视频生成耗时
        time.sleep(20)
        
        # 实际逻辑：调用 Sora/Wan2.1 API
        
        result_payload = {
            "requestId": request_id,
            "status": "Succeed",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": f"视频片段 (ID: {request_id}) 已生成。"
                    },
                    {
                        "type": "video_url",
                        "video_url": {
                            "url": "https://example.com/generated_video.mp4"
                        }
                    }
                ]
            }
        }

        callback_url = f"{callback_base_url}/{plugin_name}/{request_id}"
        requests.post(callback_url, json=result_payload, timeout=30)

    except Exception as e:
        error_payload = {"requestId": request_id, "status": "Failed", "error": str(e)}
        callback_url = f"{callback_base_url}/{plugin_name}/{request_id}"
        requests.post(callback_url, json=error_payload, timeout=30)

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return
        
        args = json.loads(input_data)
        image_url = args.get("image_url")
        image_base64 = args.get("image_base64")
        prompt = args.get("prompt")
        duration = args.get("duration", 5)

        if not image_url and not image_base64:
            print(json.dumps({"status": "error", "error": "Missing image_url parameter."}))
            return

        request_id = str(uuid.uuid4())
        callback_base_url = os.getenv("CALLBACK_BASE_URL")
        plugin_name = os.getenv("PLUGIN_NAME_FOR_CALLBACK")

        if callback_base_url and plugin_name:
            thread = threading.Thread(target=poll_and_callback, args=(
                request_id, image_url, image_base64, prompt, duration, callback_base_url, plugin_name
            ))
            thread.start()

            result_string = (
                f"视频生成任务 (ID: {request_id}) 已提交。\n"
                f"请在你的回复中包含以下占位符原文：{{{{VCP_ASYNC_RESULT::VideoGen::{request_id}}}}}"
            )
            print(json.dumps({"status": "success", "result": result_string}))
        else:
            print(json.dumps({"status": "error", "error": "Missing callback environment variables."}))

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    main()