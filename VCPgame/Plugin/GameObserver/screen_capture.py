#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
屏幕捕获模块
使用mss进行高性能屏幕截图
"""

import mss
import mss.tools
from PIL import Image
import io
import platform


class ScreenCapture:
    """屏幕捕获类"""
    
    def __init__(self, tesseract_path=None):
        """初始化"""
        self.sct = mss.mss()
        self.tesseract_path = tesseract_path
        self.system = platform.system()
    
    def list_windows(self):
        """
        列出所有可见窗口
        
        返回:
            窗口信息列表
        """
        windows = []
        
        try:
            if self.system == 'Windows':
                import win32gui
                
                def callback(hwnd, windows):
                    if win32gui.IsWindowVisible(hwnd):
                        title = win32gui.GetWindowText(hwnd)
                        if title:
                            windows.append({
                                'title': title,
                                'hwnd': hwnd
                            })
                
                win32gui.EnumWindows(callback, windows)
                
            elif self.system == 'Darwin':  # macOS
                # TODO: 实现macOS窗口枚举
                pass
            
            elif self.system == 'Linux':
                # TODO: 实现Linux窗口枚举
                pass
        
        except Exception as e:
            print(f"枚举窗口失败: {e}")
        
        return windows
    
    def find_window_by_title(self, partial_title):
        """
        根据标题查找窗口
        
        参数:
            partial_title: 窗口标题（支持部分匹配）
        
        返回:
            窗口信息或None
        """
        windows = self.list_windows()
        
        for window in windows:
            if partial_title.lower() in window['title'].lower():
                return window
        
        return None
    
    def get_window_rect(self, hwnd):
        """
        获取窗口矩形区域
        
        参数:
            hwnd: 窗口句柄
        
        返回:
            (left, top, width, height)
        """
        if self.system == 'Windows':
            import win32gui
            rect = win32gui.GetWindowRect(hwnd)
            # rect is (left, top, right, bottom)
            return (rect[0], rect[1], rect[2] - rect[0], rect[3] - rect[1])
        
        return None
    
    def capture_window(self, window_title=None, region=None):
        """
        捕获窗口或屏幕区域
        
        参数:
            window_title: 窗口标题（可选）
            region: 自定义区域 (x, y, width, height)（可选）
        
        返回:
            {
                'success': bool,
                'image': PIL.Image,
                'image_bytes': bytes,
                'window_title': str,
                'window_size': dict
            }
        """
        try:
            monitor = None
            captured_title = "Full Screen"
            
            # 如果指定了窗口标题
            if window_title:
                window = self.find_window_by_title(window_title)
                if not window:
                    return {
                        'success': False,
                        'error': f"未找到窗口: {window_title}"
                    }
                
                rect = self.get_window_rect(window['hwnd'])
                if rect:
                    monitor = {
                        'left': rect[0],
                        'top': rect[1],
                        'width': rect[2],
                        'height': rect[3]
                    }
                    captured_title = window['title']
            
            # 如果指定了自定义区域
            elif region:
                monitor = {
                    'left': region[0],
                    'top': region[1],
                    'width': region[2],
                    'height': region[3]
                }
            
            # 否则捕获主屏幕
            else:
                monitor = self.sct.monitors[1]  # 主屏幕
            
            # 执行截图
            screenshot = self.sct.grab(monitor)
            
            # 转换为PIL Image
            img = Image.frombytes('RGB', screenshot.size, screenshot.rgb)
            
            # 转换为字节
            img_bytes_io = io.BytesIO()
            img.save(img_bytes_io, format='PNG')
            img_bytes = img_bytes_io.getvalue()
            
            return {
                'success': True,
                'image': img,
                'image_bytes': img_bytes,
                'window_title': captured_title,
                'window_size': {
                    'width': screenshot.width,
                    'height': screenshot.height
                }
            }
            
        except Exception as e:
            return {
                'success': False,
                'error': str(e)
            }
    
    def __del__(self):
        """清理资源"""
        if hasattr(self, 'sct'):
            self.sct.close()