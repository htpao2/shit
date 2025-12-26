import sys
import json
import os
import threading
import time
import requests
import uuid

def poll_and_callback(request_id, video_clips, audio_tracks, output_name, callback_base_url, plugin_name):
    try:
        # 模拟视频合成耗时
        time.sleep(30)
        
        # 实际逻辑：使用 MoviePy 或 FFmpeg 拼接视频
        # 这里需要处理超栈追踪，如果视频/音频在远程节点，需要先下载
        
        result_payload = {
            "requestId": request_id,
            "status": "Succeed",
            "result": {
                "content": [
                    {
                        "type": "text",
                        "text": f"最终视频 (ID: {request_id}) 已合成完毕。"
                    },
                    {
                        "type": "video_url",
                        "video_url": {
                            "url": "https://example.com/final_movie.mp4"
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
        video_clips = args.get("video_clips", [])
        audio_tracks = args.get("audio_tracks", [])
        output_name = args.get("output_name", "final_video.mp4")

        if not video_clips:
            print(json.dumps({"status": "error", "error": "Missing video_clips parameter."}))
            return

        request_id = str(uuid.uuid4())
        callback_base_url = os.getenv("CALLBACK_BASE_URL")
        plugin_name = os.getenv("PLUGIN_NAME_FOR_CALLBACK")

        if callback_base_url and plugin_name:
            thread = threading.Thread(target=poll_and_callback, args=(
                request_id, video_clips, audio_tracks, output_name, callback_base_url, plugin_name
            ))
            thread.start()

            result_string = (
                f"视频合成任务 (ID: {request_id}) 已提交。\n"
                f"请在你的回复中包含以下占位符原文：{{{{VCP_ASYNC_RESULT::VideoEditor::{request_id}}}}}"
            )
            print(json.dumps({"status": "success", "result": result_string}))
        else:
            print(json.dumps({"status": "error", "error": "Missing callback environment variables."}))

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    main()