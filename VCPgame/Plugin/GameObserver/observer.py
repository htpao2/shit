#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GameObserver Plugin - 游戏状态观察器
捕获游戏画面和状态，为AI提供实时游戏信息
"""

import sys
import json
import base64
import os
from datetime import datetime
import traceback

# 导入自定义模块
from screen_capture import ScreenCapture
from state_recognition import StateRecognition


def print_json_output(status, result=None, error=None):
    """统一的JSON输出格式"""
    output = {"status": status}
    if result is not None:
        output["result"] = result
    if error is not None:
        output["error"] = error
    print(json.dumps(output, ensure_ascii=False), file=sys.stdout)
    sys.stdout.flush()


def load_config():
    """从环境变量加载配置"""
    config = {
        'game_window_title': os.getenv('GAME_WINDOW_TITLE', ''),
        'capture_interval_ms': int(os.getenv('CAPTURE_INTERVAL_MS', 1000)),
        'enable_ocr': os.getenv('ENABLE_OCR', 'true').lower() == 'true',
        'enable_object_detection': os.getenv('ENABLE_OBJECT_DETECTION', 'false').lower() == 'true',
        'ocr_regions': json.loads(os.getenv('OCR_REGIONS', '{}')),
        'tesseract_path': os.getenv('TESSERACT_PATH', None)
    }
    return config


def capture_game_state(args, config):
    """
    捕获游戏状态
    
    参数:
        args: 请求参数
        config: 配置信息
    
    返回:
        包含游戏状态的字典
    """
    # 获取参数
    window_title = args.get('window_title') or args.get('windowTitle') or config['game_window_title']
    capture_region = args.get('capture_region') or args.get('captureRegion')
    enable_ocr = args.get('enable_ocr', args.get('enableOcr', config['enable_ocr']))
    ocr_regions = args.get('ocr_regions') or args.get('ocrRegions')
    
    # 解析OCR区域
    if isinstance(ocr_regions, str):
        try:
            ocr_regions = json.loads(ocr_regions)
        except:
            ocr_regions = config['ocr_regions']
    elif not ocr_regions:
        ocr_regions = config['ocr_regions']
    
    # 解析捕获区域
    region = None
    if capture_region:
        try:
            parts = capture_region.split(',')
            region = tuple(map(int, parts))  # (x, y, width, height)
        except:
            pass
    
    # 初始化捕获器
        }


def get_window_list(config):
    """获取所有可见窗口列表"""
    try:
        capturer = ScreenCapture(tesseract_path=config.get('tesseract_path'))
        windows = capturer.list_windows()
        
        return {
            "windows": windows,
            "count": len(windows)
        }
    except Exception as e:
        return {
            "error": f"获取窗口列表失败: {str(e)}",
            "traceback": traceback.format_exc()
        }


def main():
    """主函数"""
    try:
        # 加载配置
        config = load_config()
        
        # 读取stdin输入
        input_line = sys.stdin.read().strip()
        
        if not input_line:
            print_json_output("error", error="未收到输入参数")
            sys.exit(1)
        
        # 解析JSON参数
        try:
            args = json.loads(input_line)
        except json.JSONDecodeError as e:
            print_json_output("error", error=f"JSON解析失败: {str(e)}")
            sys.exit(1)
        
        # 获取命令类型
        command = args.get('command', 'CaptureGameState')
        
        # 执行相应命令
        if command == 'GetWindowList':
            result = get_window_list(config)
        else:
            # 默认执行捕获
            result = capture_game_state(args, config)
        
        # 检查是否有错误
        if 'error' in result:
            print_json_output("error", error=result['error'])
            sys.exit(1)
        
        # 返回成功结果
        print_json_output("success", result=result)
        sys.exit(0)
        
    except Exception as e:
        print_json_output("error", error=f"未知错误: {str(e)}", traceback=traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()