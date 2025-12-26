#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
DemandRadar - 需求雷达插件
在 Reddit 等平台利用关键词组合捕捉具有明确需求意向的帖子
"""

import sys
import json
import os
import requests
import re
from typing import Dict, Any, List, Optional
from urllib.parse import quote

# 默认意向模式列表 - 这些短语通常表明用户有明确需求
DEFAULT_INTENT_PATTERNS = [
    "looking for",
    "is there a way",
    "need help with",
    "any recommendations",
    "best tool for",
    "how do i",
    "how can i",
    "want to build",
    "trying to find",
    "does anyone know",
    "can someone recommend",
    "what's the best",
    "alternative to",
    "struggling with",
    "frustrated with"
]

def search_reddit(query: str, subreddits: Optional[List[str]] = None, limit: int = 10) -> List[Dict]:
    """
    使用 Reddit 搜索 API 搜索帖子
    """
    user_agent = os.environ.get("REDDIT_USER_AGENT", "VCP_DemandRadar/1.0")
    headers = {"User-Agent": user_agent}
    
    results = []
    
    # 如果指定了 subreddits，在每个版块中搜索
    if subreddits:
        for subreddit in subreddits[:5]:  # 限制最多5个版块
            try:
                url = f"https://www.reddit.com/r/{subreddit}/search.json"
                params = {
                    "q": query,
                    "restrict_sr": "true",
                    "sort": "relevance",
                    "t": "month",  # 最近一个月
                    "limit": limit
                }
                resp = requests.get(url, headers=headers, params=params, timeout=15)
                if resp.status_code == 200:
                    data = resp.json()
                    for child in data.get("data", {}).get("children", []):
                        post = child.get("data", {})
                        results.append({
                            "subreddit": post.get("subreddit", ""),
                            "title": post.get("title", ""),
                            "selftext": post.get("selftext", ""),
                            "url": f"https://reddit.com{post.get('permalink', '')}",
                            "score": post.get("score", 0),
                            "num_comments": post.get("num_comments", 0),
                            "author": post.get("author", ""),
                            "created_utc": post.get("created_utc", 0)
                        })
            except Exception as e:
                continue
    else:
        # 全站搜索
        try:
            url = "https://www.reddit.com/search.json"
            params = {
                "q": query,
                "sort": "relevance",
                "t": "month",
                "limit": limit
            }
            resp = requests.get(url, headers=headers, params=params, timeout=15)
            if resp.status_code == 200:
                data = resp.json()
                for child in data.get("data", {}).get("children", []):
                    post = child.get("data", {})
                    results.append({
                        "subreddit": post.get("subreddit", ""),
                        "title": post.get("title", ""),
                        "selftext": post.get("selftext", ""),
                        "url": f"https://reddit.com{post.get('permalink', '')}",
                        "score": post.get("score", 0),
                        "num_comments": post.get("num_comments", 0),
                        "author": post.get("author", ""),
                        "created_utc": post.get("created_utc", 0)
                    })
        except Exception as e:
            pass
    
    return results

def analyze_intent(text: str, intent_patterns: List[str]) -> Dict[str, Any]:
    """
    分析文本中的意向信号
    返回匹配的意向模式和置信度评分
    """
    text_lower = text.lower()
    matched_patterns = []
    
    for pattern in intent_patterns:
        if pattern.lower() in text_lower:
            matched_patterns.append(pattern)
    
    # 计算意向强度评分 (0-100)
    score = min(len(matched_patterns) * 25, 100)
    
    # 额外的强意向信号检测
    strong_signals = [
        r'\$\d+',  # 提到预算
        r'willing to pay',
        r'budget',
        r'asap',
        r'urgent',
        r'deadline'
    ]
    
    for signal in strong_signals:
        if re.search(signal, text_lower):
            score = min(score + 15, 100)
            matched_patterns.append(f"[强信号] {signal}")
    
    return {
        "matched_patterns": matched_patterns,
        "intent_score": score,
        "has_intent": len(matched_patterns) > 0
    }

def scan_opportunities(keywords: str, subreddits: Optional[str] = None, 
                       intent_patterns: Optional[str] = None, limit: int = 10) -> Dict[str, Any]:
    """
    扫描 Reddit 寻找具有明确需求意向的帖子
    """
    try:
        # 解析 subreddits
        sub_list = None
        if subreddits:
            sub_list = [s.strip() for s in subreddits.split(",") if s.strip()]
        
        # 解析意向模式
        patterns = DEFAULT_INTENT_PATTERNS.copy()
        if intent_patterns:
            custom_patterns = [p.strip() for p in intent_patterns.split(",") if p.strip()]
            patterns.extend(custom_patterns)
        
        # 搜索帖子
        posts = search_reddit(keywords, sub_list, limit * 2)  # 多搜索一些用于过滤
        
        # 分析每个帖子的意向
        opportunities = []
        for post in posts:
            full_text = f"{post['title']} {post['selftext']}"
            intent_analysis = analyze_intent(full_text, patterns)
            
            if intent_analysis["has_intent"]:
                opportunities.append({
                    **post,
                    "intent_analysis": intent_analysis
                })
        
        # 按意向评分排序
        opportunities.sort(key=lambda x: x["intent_analysis"]["intent_score"], reverse=True)
        opportunities = opportunities[:limit]
        
        # 构建结果字符串
        result_parts = [f"## 需求机会扫描结果\n"]
        result_parts.append(f"**搜索关键词:** {keywords}")
        if sub_list:
            result_parts.append(f"**搜索版块:** {', '.join(sub_list)}")
        result_parts.append(f"**发现 {len(opportunities)} 个潜在需求帖子**\n")
        
        for i, opp in enumerate(opportunities, 1):
            intent = opp["intent_analysis"]
            result_parts.append(f"### {i}. [{opp['subreddit']}] {opp['title']}")
            result_parts.append(f"- 🔗 链接: {opp['url']}")
            result_parts.append(f"- 📊 评分: {opp['score']} | 💬 评论: {opp['num_comments']} | 👤 作者: u/{opp['author']}")
            result_parts.append(f"- 🎯 **意向强度: {intent['intent_score']}/100**")
            result_parts.append(f"- 🔍 匹配模式: {', '.join(intent['matched_patterns'])}")
            
            if opp['selftext']:
                text = opp['selftext'][:400] + "..." if len(opp['selftext']) > 400 else opp['selftext']
                result_parts.append(f"\n**帖子内容:**\n{text}")
            result_parts.append("")
        
        if not opportunities:
            result_parts.append("未找到明确表达需求意向的帖子。建议尝试不同的关键词或扩大搜索范围。")
        
        return {
            "status": "success",
            "result": "\n".join(result_parts)
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": f"扫描失败: {str(e)}"
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
        
        command = args.get("command") or args.get("Command") or "scan_opportunities"
        command = command.lower()
        
        if command == "scan_opportunities":
            keywords = args.get("keywords") or args.get("Keywords") or args.get("keyword")
            if not keywords:
                print(json.dumps({"status": "error", "error": "需要 keywords 参数"}))
                sys.exit(1)
            
            subreddits = args.get("subreddits") or args.get("Subreddits") or args.get("subreddit")
            intent_patterns = args.get("intent_patterns") or args.get("patterns")
            limit = int(args.get("limit") or args.get("Limit") or 10)
            limit = min(max(limit, 1), 30)
            
            result = scan_opportunities(keywords, subreddits, intent_patterns, limit)
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