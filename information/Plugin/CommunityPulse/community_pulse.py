#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CommunityPulse - 社群情报脉搏插件
自动化抓取 Hacker News 和 Reddit 的热门内容
"""

import sys
import json
import os
import requests
from typing import Dict, Any, List, Optional

# Hacker News API 基础URL
HN_API_BASE = "https://hacker-news.firebaseio.com/v0"

def fetch_hn_item(item_id: int) -> Optional[Dict]:
    """获取单个 HN 项目详情"""
    try:
        resp = requests.get(f"{HN_API_BASE}/item/{item_id}.json", timeout=10)
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        return None

def fetch_hn_comments(item: Dict, max_comments: int = 10) -> List[Dict]:
    """获取帖子的评论"""
    comments = []
    kids = item.get("kids", [])[:max_comments]
    
    for kid_id in kids:
        comment = fetch_hn_item(kid_id)
        if comment and comment.get("text"):
            comments.append({
                "author": comment.get("by", "anonymous"),
                "text": comment.get("text", ""),
                "time": comment.get("time", 0)
            })
    return comments

def fetch_hn_top(limit: int = 5) -> Dict[str, Any]:
    """
    获取 Hacker News 首页热门帖子
    """
    try:
        # 获取热门帖子ID列表
        resp = requests.get(f"{HN_API_BASE}/topstories.json", timeout=10)
        resp.raise_for_status()
        top_ids = resp.json()[:limit]
        
        posts = []
        for post_id in top_ids:
            item = fetch_hn_item(post_id)
            if item:
                comments = fetch_hn_comments(item, max_comments=5)
                posts.append({
                    "id": item.get("id"),
                    "title": item.get("title", ""),
                    "url": item.get("url", f"https://news.ycombinator.com/item?id={item.get('id')}"),
                    "score": item.get("score", 0),
                    "author": item.get("by", "anonymous"),
                    "comment_count": item.get("descendants", 0),
                    "top_comments": comments
                })
        
        # 构建结果字符串
        result_parts = ["## Hacker News 热门帖子\n"]
        for i, post in enumerate(posts, 1):
            result_parts.append(f"### {i}. {post['title']}")
            result_parts.append(f"- 链接: {post['url']}")
            result_parts.append(f"- 得分: {post['score']} | 作者: {post['author']} | 评论数: {post['comment_count']}")
            
            if post['top_comments']:
                result_parts.append("\n**热门评论:**")
                for j, comment in enumerate(post['top_comments'], 1):
                    # 清理HTML标签
                    text = comment['text'].replace('<p>', '\n').replace('</p>', '')
                    text = text[:300] + "..." if len(text) > 300 else text
                    result_parts.append(f"  {j}. [{comment['author']}]: {text}")
            result_parts.append("")
        
        return {
            "status": "success",
            "result": "\n".join(result_parts)
        }
        
    except Exception as e:
        return {
            "status": "error",
            "error": f"获取 Hacker News 数据失败: {str(e)}"
        }

def fetch_subreddit_hot(subreddit: str, limit: int = 5) -> Dict[str, Any]:
    """
    获取指定 Subreddit 的热门帖子
    使用 Reddit JSON API (无需认证的公开端点)
    """
    try:
        user_agent = os.environ.get("REDDIT_USER_AGENT", "VCP_CommunityPulse/1.0")
        headers = {"User-Agent": user_agent}
        
        # 使用公开的 JSON 端点
        url = f"https://www.reddit.com/r/{subreddit}/hot.json?limit={limit}"
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        
        posts = []
        for child in data.get("data", {}).get("children", []):
            post_data = child.get("data", {})
            
            # 获取帖子评论
            comments = []
            try:
                comment_url = f"https://www.reddit.com/r/{subreddit}/comments/{post_data.get('id')}.json?limit=5"
                comment_resp = requests.get(comment_url, headers=headers, timeout=10)
                if comment_resp.status_code == 200:
                    comment_data = comment_resp.json()
                    if len(comment_data) > 1:
                        for comment_child in comment_data[1].get("data", {}).get("children", [])[:5]:
                            c_data = comment_child.get("data", {})
                            if c_data.get("body"):
                                comments.append({
                                    "author": c_data.get("author", "anonymous"),
                                    "text": c_data.get("body", ""),
                                    "score": c_data.get("score", 0)
                                })
            except:
                pass
            
            posts.append({
                "id": post_data.get("id"),
                "title": post_data.get("title", ""),
                "url": f"https://reddit.com{post_data.get('permalink', '')}",
                "external_url": post_data.get("url", ""),
                "score": post_data.get("score", 0),
                "author": post_data.get("author", "anonymous"),
                "comment_count": post_data.get("num_comments", 0),
                "selftext": post_data.get("selftext", "")[:500],
                "top_comments": comments
            })
        
        # 构建结果字符串
        result_parts = [f"## r/{subreddit} 热门帖子\n"]
        for i, post in enumerate(posts, 1):
            result_parts.append(f"### {i}. {post['title']}")
            result_parts.append(f"- Reddit链接: {post['url']}")
            if post['external_url'] and post['external_url'] != post['url']:
                result_parts.append(f"- 外部链接: {post['external_url']}")
            result_parts.append(f"- 得分: {post['score']} | 作者: u/{post['author']} | 评论数: {post['comment_count']}")
            
            if post['selftext']:
                text = post['selftext'][:300] + "..." if len(post['selftext']) > 300 else post['selftext']
                result_parts.append(f"\n**帖子内容:** {text}")
            
            if post['top_comments']:
                result_parts.append("\n**热门评论:**")
                for j, comment in enumerate(post['top_comments'], 1):
                    text = comment['text'][:300] + "..." if len(comment['text']) > 300 else comment['text']
                    result_parts.append(f"  {j}. [u/{comment['author']} | {comment['score']}分]: {text}")
            result_parts.append("")
        
        return {
            "status": "success",
            "result": "\n".join(result_parts)
        }
        
    except requests.exceptions.HTTPError as e:
        if e.response.status_code == 403:
            return {
                "status": "error",
                "error": f"无法访问 r/{subreddit}，可能是私有版块或被限制访问"
            }
        elif e.response.status_code == 404:
            return {
                "status": "error",
                "error": f"Subreddit r/{subreddit} 不存在"
            }
        else:
            return {
                "status": "error",
                "error": f"获取 Reddit 数据失败: HTTP {e.response.status_code}"
            }
    except Exception as e:
        return {
            "status": "error",
            "error": f"获取 Reddit 数据失败: {str(e)}"
        }

def main():
    """主函数：读取 stdin，执行命令，输出结果"""
    try:
        # 读取 stdin
        input_data = sys.stdin.readline().strip()
        
        if not input_data:
            print(json.dumps({
                "status": "error",
                "error": "未收到输入数据"
            }))
            sys.exit(1)
        
        # 解析 JSON
        try:
            args = json.loads(input_data)
        except json.JSONDecodeError as e:
            print(json.dumps({
                "status": "error",
                "error": f"JSON 解析失败: {str(e)}"
            }))
            sys.exit(1)
        
        # 获取命令，支持大小写和同义词
        command = args.get("command") or args.get("Command") or args.get("action") or args.get("Action")
        
        if not command:
            print(json.dumps({
                "status": "error",
                "error": "未指定 command 参数。可用命令: fetch_hn_top, fetch_subreddit_hot"
            }))
            sys.exit(1)
        
        command = command.lower()
        
        # 执行对应命令
        if command == "fetch_hn_top":
            limit = int(args.get("limit") or args.get("Limit") or 5)
            limit = min(max(limit, 1), 20)  # 限制范围 1-20
            result = fetch_hn_top(limit)
            
        elif command == "fetch_subreddit_hot":
            subreddit = args.get("subreddit") or args.get("Subreddit") or args.get("sub")
            if not subreddit:
                print(json.dumps({
                    "status": "error",
                    "error": "fetch_subreddit_hot 需要 subreddit 参数"
                }))
                sys.exit(1)
            
            limit = int(args.get("limit") or args.get("Limit") or 5)
            limit = min(max(limit, 1), 20)
            result = fetch_subreddit_hot(subreddit, limit)
            
        else:
            print(json.dumps({
                "status": "error",
                "error": f"未知命令: {command}。可用命令: fetch_hn_top, fetch_subreddit_hot"
            }))
            sys.exit(1)
        
        # 输出结果
        print(json.dumps(result, ensure_ascii=False))
        sys.exit(0)
        
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "error": f"插件执行异常: {str(e)}"
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()