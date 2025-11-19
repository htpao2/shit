#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
状态识别模块
使用OCR和图像处理识别游戏状态
"""

import pytesseract
from PIL import Image
import re


class StateRecognition:
    """状态识别类"""
    
    def __init__(self, tesseract_path=None):
        """
        初始化
        
        参数:
            tesseract_path: Tesseract可执行文件路径（Windows需要）
        """
        if tesseract_path:
            pytesseract.pytesseract.tesseract_cmd = tesseract_path
    
    def ocr_region(self, image, region):
        """
        对图像的指定区域进行OCR识别
        
        参数:
            image: PIL Image对象
            region: 区域坐标 (x, y, width, height)
        
        返回:
            识别的文本
        """
        try:
            # 裁剪区域
            x, y, w, h = region
            cropped = image.crop((x, y, x + w, y + h))
            
            # 预处理（可选）
            # cropped = self.preprocess_image(cropped)
            
            # OCR识别
            text = pytesseract.image_to_string(
                cropped,
                config='--psm 7'  # 单行文本模式
            ).strip()
            
            # 后处理：提取数字
            text = self.extract_numbers(text)
            
            return text
            
        except Exception as e:
            return f"OCR错误: {str(e)}"
    
    def preprocess_image(self, image):
        """
        预处理图像以提高OCR准确率
        
        参数:
            image: PIL Image对象
        
        返回:
            处理后的图像
        """
        # 转换为灰度
        image = image.convert('L')
        
        # TODO: 可以添加更多预处理步骤
        # - 二值化
        # - 去噪
        # - 增强对比度
        
        return image
    
    def extract_numbers(self, text):
        """
        从文本中提取数字
        
        参数:
            text: 原始文本
        
        返回:
            提取的数字字符串
        """
        # 提取所有数字
        numbers = re.findall(r'\d+', text)
        
        if numbers:
            return ''.join(numbers)
        
        return text
    
    def detect_template(self, image, template_path, threshold=0.8):
        """
        模板匹配（用于检测特定图标、UI元素）
        
        参数:
            image: 搜索图像
            template_path: 模板图像路径
            threshold: 匹配阈值
        
        返回:
            匹配位置列表
        """
        # TODO: 实现模板匹配
        # 使用OpenCV的matchTemplate
        pass