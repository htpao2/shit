#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TrendAlert - 趋势热点预警插件
监控 Google Trends，检测关键词热度变化
"""

import sys
import json
import os
from typing import Dict, Any, List, Optional

try:
    from pytrends.request import TrendReq
    PYTRENDS_AVAILABLE = True
except ImportError:
    PYTRENDS_AVAILABLE = False

def get_pytrends_client() -> Optional[TrendReq]:
    """获取 pytrends 客户端"""
    if not PYTRENDS_AVAILABLE:
        return None
    
    proxy_url = os.environ.get("PROXY_URL", "")
    
    try:
        if proxy_url:
            proxies = {"https": proxy_url}
            return TrendReq(hl='en-US', tz=360, proxies=proxies, retries=3, backoff_factor=0.5)
        else:
            return TrendReq(hl='en-US', tz=360, retries=3, backoff_factor=0.5)
    except Exception as e:
        return None

def check_trend_growth(keywords: str, threshold: int = 100, 
                       timeframe: str = "now 7-d", geo: str = "") -> Dict[str, Any]:
    """
    检查关键词热度变化，识别爆发趋势
    """
    if not PYTRENDS_AVAILABLE:
        return {
            "status": "error",
            "error": "pytrends 库未安装。请运行: pip install pytrends"
        }
    
    pytrends = get_pytrends_client()
    if not pytrends:
        return {
            "status": "error",
            "error": "无法初始化 Google Trends 客户端。请检查网络连接或代理设置。"
        }
    
    try:
        # 解析关键词
        kw_list = [k.strip() for k in keywords.split(",") if k.strip()][:5]  # 最多5个关键词
        
        if not kw_list:
            return {"status": "error", "error": "请提供至少一个关键词"}
        
        # 构建请求
        pytrends.build_payload(kw_list, cat=0, timeframe=timeframe, geo=geo)
        
        # 获取兴趣随时间变化的数据
        interest_over_time = pytrends.interest_over_time()
        
        if interest_over_time.empty:
            return {
                "status": "success",
                "result": f"未找到关键词 [{', '.join(kw_list)}] 的趋势数据。可能是关键词太生僻或地区限制。"
            }
        
        # 分析每个关键词的趋势
        alerts = []
        analysis = []
        
        for keyword in kw_list:
            if keyword not in interest_over_time.columns:
                continue
            
            data = interest_over_time[keyword]
            
            # 计算统计数据
            current_value = data.iloc[-1] if len(data) > 0 else 0
            avg_value = data.mean()
            max_value = data.max()
            min_value = data.min()
            
            # 计算增长率 (最近值 vs 平均值)
            if avg_value > 0:
                growth_rate = ((current_value - avg_value) / avg_value) * 100
            else:
                growth_rate = 0
            
            # 计算趋势方向 (最后1/3 vs 前2/3)
            split_point = len(data) // 3
            if split_point > 0:
                early_avg = data.iloc[:split_point*2].mean()
                late_avg = data.iloc[split_point*2:].mean()
                if early_avg > 0:
                    trend_direction = ((late_avg - early_avg) / early_avg) * 100
                else:
                    trend_direction = 0
            else:
                trend_direction = 0
            
            # 判断是否触发预警
            is_alert = growth_rate >= threshold or trend_direction >= threshold
            
            keyword_analysis = {
                "keyword": keyword,
                "current_index": int(current_value),
                "average_index": round(avg_value, 1),
                "max_index": int(max_value),
                "growth_rate": round(growth_rate, 1),
                "trend_direction": round(trend_direction, 1),
                "is_alert": is_alert
            }
            
            analysis.append(keyword_analysis)
            
            if is_alert:
                alerts.append(keyword)
        
        # 构建结果
        result_parts = ["## Google Trends 趋势分析报告\n"]
        result_parts.append(f"**监控关键词:** {', '.join(kw_list)}")
        result_parts.append(f"**时间范围:** {timeframe}")
        result_parts.append(f"**地区:** {geo if geo else '全球'}")
        result_parts.append(f"**预警阈值:** {threshold}%\n")
        
        if alerts:
            result_parts.append(f"### 🚨 预警触发！以下关键词热度显著上升:")
            result_parts.append(f"**{', '.join(alerts)}**\n")
        
        result_parts.append("### 详细分析:\n")
        
        for item in analysis:
            status_icon = "🔥" if item["is_alert"] else "📊"
            result_parts.append(f"#### {status_icon} {item['keyword']}")
            result_parts.append(f"- 当前热度指数: **{item['current_index']}** / 100")
            result_parts.append(f"- 平均热度指数: {item['average_index']}")
            result_parts.append(f"- 峰值热度指数: {item['max_index']}")
            result_parts.append(f"- 相对均值增长: **{item['growth_rate']:+.1f}%**")
            result_parts.append(f"- 趋势方向: {item['trend_direction']:+.1f}%")
            
            # 趋势解读
            if item['trend_direction'] > 50:
                result_parts.append(f"- 📈 趋势解读: **强劲上升趋势**")
            elif item['trend_direction'] > 0:
                result_parts.append(f"- 📈 趋势解读: 温和上升")
            elif item['trend_direction'] > -20:
                result_parts.append(f"- ➡️ 趋势解读: 相对平稳")
            else:
                result_parts.append(f"- 📉 趋势解读: 下降趋势")
            
            # Google Trends 链接
            encoded_keyword = item['keyword'].replace(' ', '%20')
            trends_url = f"https://trends.google.com/trends/explore?q={encoded_keyword}&date={timeframe.replace(' ', '%20')}"
            if geo:
                trends_url += f"&geo={geo}"
            result_parts.append(f"- 🔗 [查看详细趋势图]({trends_url})")
            result_parts.append("")
        
        return {
            "status": "success",
            "result": "\n".join(result_parts),
            "alerts": alerts,
            "analysis": analysis
        }
        
    except Exception as e:
        error_msg = str(e)
        if "429" in error_msg or "rate" in error_msg.lower():
            return {
                "status": "error",
                "error": "Google Trends API 请求过于频繁，请稍后再试。建议配置代理。"
            }
        return {
            "status": "error",
            "error": f"趋势分析失败: {error_msg}"
        }

def get_related_queries(keyword: str, geo: str = "") -> Dict[str, Any]:
    """
    获取与关键词相关的热门查询和上升查询
    """
    if not PYTRENDS_AVAILABLE:
        return {
            "status": "error",
            "error": "pytrends 库未安装。请运行: pip install pytrends"
        }
    
    pytrends = get_pytrends_client()
    if not pytrends:
        return {
            "status": "error",
            "error": "无法初始化 Google Trends 客户端"
        }
    
    try:
        pytrends.build_payload([keyword], cat=0, timeframe="today 3-m", geo=geo)
        
        related = pytrends.related_queries()
        
        if not related or keyword not in related:
            return {
                "status": "success",
                "result": f"未找到与 '{keyword}' 相关的查询词"
            }
        
        kw_data = related[keyword]
        
        result_parts = [f"## 与 '{keyword}' 相关的查询词\n"]
        
        # 热门查询
        top_queries = kw_data.get("top")
        if top_queries is not None and not top_queries.empty:
            result_parts.append("### 🔝 热门查询 (Top Queries)")
            for _, row in top_queries.head(10).iterrows():
                result_parts.append(f"- {row['query']} (热度: {row['value']})")
            result_parts.append("")
        
        # 上升查询
        rising_queries = kw_data.get("rising")
        if rising_queries is not None and not rising_queries.empty:
            result_parts.append("### 📈 上升查询 (Rising Queries)")
            for _, row in rising_queries.head(10).iterrows():
                value = row['value']
                if isinstance(value, str) and "Breakout" in value:
                    result_parts.append(f"- 🚀 **{row['query']}** - **爆发式增长!**")
                else:
                    result_parts.append(f"- {row['query']} (+{value}%)")
            result_parts.append("")
        
        if len(result_parts) == 1:
            result_parts.append("未找到相关查询数据")
        
        return {
            "status": "success",
            "result": "\n".join(result_parts)
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": f"获取相关查询失败: {str(e)}"
        }

def main():
    """主函数"""
    try:
        input_data = sys.stdin.readline().strip()
        
        if not input_data:
            print(json.dumps({"status": "error", "error": "未收到输入数据"}))
            sys.exit(1)
        
        try:
            args = json.loads(input_data)
        except json.JSONDecodeError as e:
            print(json.dumps({"status": "error", "error": f"JSON 解析失败: {str(e)}"}))
            sys.exit(1)
        
        command = args.get("command") or args.get("Command") or "check_trend_growth"
        command = command.lower()
        
        if command == "check_trend_growth":
            keywords = args.get("keywords") or args.get("Keywords") or args.get("keyword")
            if not keywords:
                print(json.dumps({"status": "error", "error": "需要 keywords 参数"}))
                sys.exit(1)
            
            threshold = int(args.get("threshold") or args.get("Threshold") or 100)
            timeframe = args.get("timeframe") or args.get("Timeframe") or "now 7-d"
            geo = args.get("geo") or args.get("Geo") or ""
            
            result = check_trend_growth(keywords, threshold, timeframe, geo)
            
        elif command == "get_related_queries":
            keyword = args.get("keyword") or args.get("Keyword")
            if not keyword:
                print(json.dumps({"status": "error", "error": "需要 keyword 参数"}))
                sys.exit(1)
            
            geo = args.get("geo") or args.get("Geo") or ""
            result = get_related_queries(keyword, geo)
            
        else:
            print(json.dumps({"status": "error", "error": f"未知命令: {command}"}))
            sys.exit(1)
        
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({"status": "error", "error": f"插件执行异常: {str(e)}"}))
        sys.exit(1)

if __name__ == "__main__":
    main()