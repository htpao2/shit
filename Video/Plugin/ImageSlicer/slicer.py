import sys
import json
import os
import io
import base64
from PIL import Image
import requests
from urllib.parse import urlparse

def get_image_data(url, image_base64=None):
    """
    处理图片获取，支持本地文件、HTTP 和 VCP 重试注入的 base64。
    """
    if image_base64:
        # 处理 Data URI
        if image_base64.startswith('data:image'):
            header, encoded = image_base64.split(",", 1)
            return Image.open(io.BytesIO(base64.b64decode(encoded)))
        return Image.open(io.BytesIO(base64.b64decode(image_base64)))

    if url.startswith('http'):
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        return Image.open(io.BytesIO(response.content))
    
    if url.startswith('file://'):
        # 转换 file:// 协议为本地路径
        parsed = urlparse(url)
        file_path = os.path.abspath(parsed.path.lstrip('/'))
        # Windows 路径处理
        if os.name == 'nt' and not file_path.startswith('\\\\'):
             if parsed.netloc: # 处理 file://C:/...
                 file_path = parsed.netloc + ":" + parsed.path
             else:
                 file_path = parsed.path.lstrip('/')

        if not os.path.exists(file_path):
            # 触发超栈追踪
            error_payload = {
                "status": "error",
                "code": "FILE_NOT_FOUND_LOCALLY",
                "error": "本地文件未找到，需要远程获取。",
                "fileUrl": url,
                "failedParameter": "image_url"
            }
            print(json.dumps(error_payload))
            sys.exit(0) # 正常退出，让主服务拦截错误
        
        return Image.open(file_path)
    
    raise ValueError(f"Unsupported URL format: {url}")

def slice_image(img, rows, cols):
    width, height = img.size
    tile_width = width // cols
    tile_height = height // rows
    
    tiles = []
    for r in range(rows):
        for c in range(cols):
            left = c * tile_width
            top = r * tile_height
            right = left + tile_width
            bottom = top + tile_height
            
            tile = img.crop((left, top, right, bottom))
            
            # 转换为 base64 返回
            buffered = io.BytesIO()
            tile.save(buffered, format="PNG")
            img_str = base64.b64encode(buffered.getvalue()).decode()
            tiles.append({
                "id": len(tiles) + 1,
                "row": r + 1,
                "col": c + 1,
                "data": f"data:image/png;base64,{img_str}"
            })
    return tiles

def main():
    try:
        input_data = sys.stdin.read()
        if not input_data:
            return
        
        args = json.loads(input_data)
        image_url = args.get("image_url")
        image_base64 = args.get("image_base64") # VCP 重试时注入
        rows = int(args.get("rows", 1))
        cols = int(args.get("cols", 1))

        if not image_url and not image_base64:
            print(json.dumps({"status": "error", "error": "Missing image_url parameter."}))
            return

        img = get_image_data(image_url, image_base64)
        tiles = slice_image(img, rows, cols)
        
        print(json.dumps({"status": "success", "result": {"tiles": tiles}}))

    except Exception as e:
        print(json.dumps({"status": "error", "error": str(e)}))

if __name__ == "__main__":
    main()