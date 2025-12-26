import sys
import json
import os
import threading
import time
import requests
import uuid

def poll_and_callback(request_id, text, voice_id, reference_audio, callback_base_url, plugin_name):
    try:
        # 模拟音频生成耗时
        time.sleep(5)
        
        # 实际逻辑：调用 TTS 或声音克隆 API
        
        result_payload = {
            "requestId": request_id,
            "status": "Succeed",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": f"音频 (ID: {request_id}) 已生成。"
                    },
                    {
                        "type": "audio_url",
                        "audio_url": {
                            "url": "https://example.com/generated_audio.mp3"
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
        text = args.get("text")
        voice_id = args.get("voice_id", "default")
        reference_audio = args.get("reference_audio")

        if not text:
            print(json.dumps({"status": "error", "error": "Missing text parameter."}))
            return

        request_id = str(uuid.uuid4())
        callback_base_url = os.getenv("CALLBACK_BASE_URL")
        plugin_name = os.getenv("PLUGIN_NAME_FOR_CALLBACK")

        if callback_base_url and plugin_name:
            thread = threading.Thread(target=poll_and_callback, args=(
                request_id, text, voice_id, reference_audio, callback_base_url, plugin_name
            ))
            thread.start()

            result_string = (
                f"音频生成任务 (ID: {request_id}) 已提交。\n"
                f"请在你的回复中包含以下占位符原文：{{{{VCP_ASYNC_RESULT::AudioStudio::{request_id}}}}}"
            )
            print(json.dumps({"status": "success", "result": result_string}))
        else:
            print(json.dumps({"status": "error", "error": "Missing callback environment variables."}))

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    main()