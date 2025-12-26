#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
KOLHunter - KOL/客户搜寻器插件
利用 Google 高级搜索指令搜寻特定领域的 KOL 和潜在客户
"""

import sys
import json
import os
import re
import time
import random
from typing import Dict, Any, List, Optional
from urllib.parse import quote_plus, urlparse

# 尝试导入搜索库
try:
    from googlesearch import search as google_search
    GOOGLESEARCH_AVAILABLE = True
except ImportError:
    GOOGLESEARCH_AVAILABLE = False

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False

# 平台域名映射
PLATFORM_DOMAINS = {
    "instagram": "instagram.com",
    "twitter": "twitter.com",
    "x": "x.com",
    "linkedin": "linkedin.com",
    "youtube": "youtube.com",
    "tiktok": "tiktok.com",
    "facebook": "facebook.com",
    "pinterest": "pinterest.com",
    "reddit": "reddit.com"
}

# 常见邮箱域名
EMAIL_DOMAINS = ["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "protonmail.com", "icloud.com"]

# 邮箱提取正则
EMAIL_PATTERN = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}'

def build_search_query(keyword: str, platform: str = "instagram", 
                       extra_terms: Optional[str] = None, include_email: bool = True) -> str:
    """
    构建 Google 高级搜索查询
    """
    domain = PLATFORM_DOMAINS.get(platform.lower(), platform)
    
    # 基础查询
    query_parts = [f'site:{domain}', f'"{keyword}"']
    
    # 添加邮箱搜索
    if include_email:
        email_query = " OR ".join([f'"{ed}"' for ed in EMAIL_DOMAINS[:3]])
        query_parts.append(f'({email_query})')
    
    # 添加额外搜索词
    if extra_terms:
        terms = [t.strip() for t in extra_terms.split(",") if t.strip()]
        for term in terms[:3]:  # 最多3个额外词
            query_parts.append(f'"{term}"')
    
    return " ".join(query_parts)

def extract_emails_from_text(text: str) -> List[str]:
    """从文本中提取邮箱"""
    if not text:
        return []
    emails = re.findall(EMAIL_PATTERN, text)
    # 过滤常见的无效邮箱
    invalid_patterns = ['example.com', 'email.com', 'domain.com', 'yourname', 'username']
    valid_emails = []
    for email in emails:
        if not any(p in email.lower() for p in invalid_patterns):
            valid_emails.append(email.lower())
    return list(set(valid_emails))

def extract_username_from_url(url: str, platform: str) -> Optional[str]:
    """从 URL 中提取用户名"""
    try:
        parsed = urlparse(url)
        path = parsed.path.strip('/')
        
        if platform in ['instagram', 'twitter', 'x', 'tiktok']:
            # 格式: /username 或 /username/...
            parts = path.split('/')
            if parts and parts[0] and parts[0] not in ['p', 'reel', 'status', 'video', 'explore', 'search']:
                return parts[0]
        elif platform == 'youtube':
            # 格式: /@username 或 /channel/xxx 或 /c/xxx
            if path.startswith('@'):
                return path.split('/')[0]
            elif '/channel/' in path or '/c/' in path or '/user/' in path:
                parts = path.split('/')
                for i, p in enumerate(parts):
                    if p in ['channel', 'c', 'user'] and i + 1 < len(parts):
                        return parts[i + 1]
        elif platform == 'linkedin':
            # 格式: /in/username
            if '/in/' in path:
                parts = path.split('/in/')
                if len(parts) > 1:
                    return parts[1].split('/')[0]
        
        return None
    except:
        return None

def search_with_google(query: str, num_results: int = 20) -> List[Dict]:
    """使用 googlesearch-python 搜索"""
    if not GOOGLESEARCH_AVAILABLE:
        return []
    
    results = []
    try:
        for url in google_search(query, num_results=num_results, sleep_interval=2):
            results.append({
                "url": url,
                "title": "",  # googlesearch 不返回标题
                "snippet": ""
            })
            time.sleep(random.uniform(0.5, 1.5))  # 避免被封
    except Exception as e:
        pass
    
    return results

def search_with_serpapi(query: str, api_key: str, num_results: int = 20) -> List[Dict]:
    """使用 SerpAPI 搜索 (更稳定但需要 API Key)"""
    if not REQUESTS_AVAILABLE or not api_key:
        return []
    
    try:
        url = "https://serpapi.com/search"
        params = {
            "q": query,
            "api_key": api_key,
            "num": num_results,
            "engine": "google"
        }
        
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        results = []
        for item in data.get("organic_results", []):
            results.append({
                "url": item.get("link", ""),
                "title": item.get("title", ""),
                "snippet": item.get("snippet", "")
            })
        
        return results
    except:
        return []

def find_contacts(keyword: str, platform: str = "instagram", 
                  include_email: bool = True, limit: int = 20) -> Dict[str, Any]:
    """
    搜索 KOL 和潜在客户联系方式
    """
    # 构建搜索查询
    query = build_search_query(keyword, platform, include_email=include_email)
    
    # 获取 API Key
    serp_api_key = os.environ.get("SERP_API_KEY", "")
    
    # 尝试搜索
    results = []
    search_method = ""
    
    if serp_api_key:
        results = search_with_serpapi(query, serp_api_key, limit)
        search_method = "SerpAPI"
    
    if not results and GOOGLESEARCH_AVAILABLE:
        results = search_with_google(query, limit)
        search_method = "Google Search"
    
    if not results:
        # 返回搜索指令让用户手动搜索
        google_url = f"https://www.google.com/search?q={quote_plus(query)}"
        return {
            "status": "success",
            "result": f"""## KOL 搜索查询已生成

**未能自动执行搜索** (可能需要安装依赖或配置 API Key)

请手动在 Google 中搜索:

**搜索查询:**
```
{query}
```

**一键搜索链接:**
[点击此处在 Google 中搜索]({google_url})

**安装依赖以启用自动搜索:**
```bash
pip install googlesearch-python requests
```

**或配置 SerpAPI (更稳定):**
在 config.env 中设置 `SERP_API_KEY=your_key`
"""
        }
    
    # 处理搜索结果
    contacts = []
    seen_usernames = set()
    
    for item in results:
        url = item.get("url", "")
        title = item.get("title", "")
        snippet = item.get("snippet", "")
        
        # 提取用户名
        username = extract_username_from_url(url, platform.lower())
        if not username or username in seen_usernames:
            continue
        seen_usernames.add(username)
        
        # 提取邮箱
        all_text = f"{title} {snippet}"
        emails = extract_emails_from_text(all_text)
        
        contacts.append({
            "username": username,
            "profile_url": url,
            "title": title,
            "snippet": snippet[:200] if snippet else "",
            "emails": emails
        })
    
    # 构建结果
    result_parts = [f"## {platform.title()} KOL 搜索结果\n"]
    result_parts.append(f"**搜索关键词:** {keyword}")
    result_parts.append(f"**搜索方式:** {search_method}")
    result_parts.append(f"**发现 {len(contacts)} 个潜在账号**\n")
    
    for i, contact in enumerate(contacts[:limit], 1):
        result_parts.append(f"### {i}. @{contact['username']}")
        result_parts.append(f"- 🔗 主页: {contact['profile_url']}")
        
        if contact['title']:
            result_parts.append(f"- 📝 标题: {contact['title']}")
        
        if contact['emails']:
            result_parts.append(f"- 📧 邮箱: {', '.join(contact['emails'])}")
        
        if contact['snippet']:
            result_parts.append(f"- 💬 摘要: {contact['snippet']}")
        
        result_parts.append("")
    
    # 添加搜索链接
    google_url = f"https://www.google.com/search?q={quote_plus(query)}"
    result_parts.append(f"\n**在 Google 中查看更多结果:**")
    result_parts.append(f"[点击搜索]({google_url})")
    
    return {
        "status": "success",
        "result": "\n".join(result_parts),
        "contacts": contacts,
        "query": query
    }

def build_search_query_command(keyword: str, platform: str = "instagram", 
                               extra_terms: Optional[str] = None) -> Dict[str, Any]:
    """
    生成搜索查询指令
    """
    query = build_search_query(keyword, platform, extra_terms, include_email=True)
    google_url = f"https://www.google.com/search?q={quote_plus(query)}"
    
    # 生成不同变体的查询
    variants = []
    
    # 基础版本 (带邮箱)
    variants.append({
        "name": "带邮箱搜索",
        "query": query,
        "url": google_url
    })
    
    # 不带邮箱版本
    query_no_email = build_search_query(keyword, platform, extra_terms, include_email=False)
    variants.append({
        "name": "仅搜索账号",
        "query": query_no_email,
        "url": f"https://www.google.com/search?q={quote_plus(query_no_email)}"
    })
    
    # 添加 "contact" 关键词
    query_contact = f'{query} ("contact" OR "business" OR "collab")'
    variants.append({
        "name": "商业合作意向",
        "query": query_contact,
        "url": f"https://www.google.com/search?q={quote_plus(query_contact)}"
    })
    
    result_parts = [f"## Google 高级搜索指令\n"]
    result_parts.append(f"**目标平台:** {platform.title()}")
    result_parts.append(f"**搜索关键词:** {keyword}")
    if extra_terms:
        result_parts.append(f"**额外条件:** {extra_terms}")
    result_parts.append("\n### 搜索变体:\n")
    
    for i, v in enumerate(variants, 1):
        result_parts.append(f"**{i}. {v['name']}**")
        result_parts.append(f"```")
        result_parts.append(v['query'])
        result_parts.append(f"```")
        result_parts.append(f"[在 Google 中搜索]({v['url']})\n")
    
    result_parts.append("### 使用提示:")
    result_parts.append("1. 复制上述查询到 Google 搜索框")
    result_parts.append("2. 可以根据需要添加或删除条件")
    result_parts.append("3. 使用引号 \"\" 精确匹配短语")
    result_parts.append("4. 使用 OR 连接多个可选条件")
    result_parts.append("5. 使用 - 排除不想要的结果")
    
    return {
        "status": "success",
        "result": "\n".join(result_parts),
        "variants": variants
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
        
        command = args.get("command") or args.get("Command") or "find_contacts"
        command = command.lower()
        
        if command == "find_contacts":
            keyword = args.get("keyword") or args.get("Keyword") or args.get("keywords")
            if not keyword:
                print(json.dumps({"status": "error", "error": "需要 keyword 参数"}))
                sys.exit(1)
            
            platform = args.get("platform") or args.get("Platform") or "instagram"
            include_email = args.get("include_email", True)
            if isinstance(include_email, str):
                include_email = include_email.lower() in ['true', '1', 'yes']
            limit = int(args.get("limit") or args.get("Limit") or 20)
            
            result = find_contacts(keyword, platform, include_email, limit)
            
        elif command == "build_search_query":
            keyword = args.get("keyword") or args.get("Keyword")
            if not keyword:
                print(json.dumps({"status": "error", "error": "需要 keyword 参数"}))
                sys.exit(1)
            
            platform = args.get("platform") or args.get("Platform") or "instagram"
            extra_terms = args.get("extra_terms") or args.get("extra")
            
            result = build_search_query_command(keyword, platform, extra_terms)
            
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