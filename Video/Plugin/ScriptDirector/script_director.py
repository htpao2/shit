import sys
import json
import os
import requests

def generate_script(plot_text):
    api_key = os.environ.get("LLM_API_KEY")
    api_base = os.environ.get("LLM_API_BASE", "https://api.openai.com/v1")
    model = os.environ.get("LLM_MODEL", "gpt-4o")

    if not api_key:
        return {"status": "error", "error": "Missing LLM_API_KEY in environment."}

    system_prompt = """
# 视频脚本与分镜生成提示词
角色 专业视频导演与分镜师，擅长将文字转化为具象化的镜头语言。

任务 将提供的【剧情文字】拆解为可执行的拍摄脚本与分镜表，确保视觉流畅且逻辑连贯。

要求
1. 场景拆分：根据剧情节奏自动拆分场景，保持时长分配均衡（每镜头约3-5秒）。
2. 画面描述：详细描述画面主体、动作、环境、光影色调。
3. 镜头语言：明确运镜方式（推拉摇移）和景别（特写/全景/中景）。
4. 音频配合：对应画面生成旁白(VO)、人声(Dialogue)或背景音效(SFX)。
5. 输出格式：请直接输出 JSON 格式的数组，每个对象包含：序号(id), 景别运镜(shot), 画面描述(visual), 旁白台词(audio), 画面提示词(prompt)。
不要包含任何 Markdown 代码块标签，只输出纯 JSON。
"""

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"剧情文字：{plot_text}"}
            ],
            "temperature": 0.7
        }
        
        response = requests.post(f"{api_base}/chat/completions", headers=headers, json=payload, timeout=60)
        response.raise_for_status()
        content = response.json()['choices'][0]['message']['content'].strip()
        
        # 尝试清理可能存在的 markdown 标签
        if content.startswith("```json"):
            content = content[7:]
        if content.endswith("```"):
            content = content[:-3]
        
        script_data = json.loads(content.strip())
        return {"status": "success", "result": script_data}

    except Exception as e:
        return {"status": "error", "error": str(e)}

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return
        
        args = json.loads(input_data)
        plot_text = args.get("plot_text") or args.get("PlotText")
        
        if not plot_text:
            output = {"status": "error", "error": "Missing plot_text parameter."}
        else:
            output = generate_script(plot_text)
            
        print(json.dumps(output, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    main()