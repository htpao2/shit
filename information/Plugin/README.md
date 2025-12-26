# VCP 情报自动化插件集

本目录包含 6 个用于需求挖掘、市场调研和竞品分析的 VCP 同步插件。

## 📦 插件概览

| 插件名称 | 功能描述 | 技术栈 | AutoRAG |
|---------|---------|--------|---------|
| **CommunityPulse** | 抓取 Hacker News/Reddit 热门内容 | Python | ✅ |
| **DemandRadar** | 监听 Reddit 上的需求意向帖子 | Python | ✅ |
| **TrendAlert** | 监控 Google Trends 热度变化 | Python | ❌ |
| **ReviewMiner** | 挖掘 App Store/Google Play 差评 | Node.js | ✅ |
| **KOLHunter** | 搜寻社交平台 KOL 联系方式 | Python | ✅ |
| **AdSpy** | 抓取 Google Ads 竞品广告 | Node.js | ❌ |

## 🚀 快速安装

### Python 插件依赖

```bash
# 安装所有 Python 插件依赖
pip install requests pytrends googlesearch-python
```

### Node.js 插件依赖

```bash
# ReviewMiner
cd Plugin/ReviewMiner
npm install

# AdSpy  
cd Plugin/AdSpy
npm install
```

## 📖 插件详情

### 1. CommunityPulse (社群情报脉搏)

**功能**: 自动抓取 Hacker News 和 Reddit 热门帖子及评论。

**指令**:
- `fetch_hn_top` - 获取 Hacker News 热门帖子
- `fetch_subreddit_hot` - 获取指定 Subreddit 热门帖子

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」CommunityPulse「末」,
command:「始」fetch_hn_top「末」,
limit:「始」5「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 2. DemandRadar (需求雷达)

**功能**: 在 Reddit 搜索带有明确需求意向的帖子 (如 "looking for", "is there a way")。

**指令**:
- `scan_opportunities` - 扫描潜在需求帖子

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」DemandRadar「末」,
command:「始」scan_opportunities「末」,
keywords:「始」AI writing tool「末」,
subreddits:「始」ArtificialInteligence,SaaS「末」,
limit:「始」10「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 3. TrendAlert (趋势预警)

**功能**: 监控 Google Trends，当关键词热度爆发时发出预警。

**依赖**: `pip install pytrends`

**指令**:
- `check_trend_growth` - 检查关键词热度变化
- `get_related_queries` - 获取相关热门查询词

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」TrendAlert「末」,
command:「始」check_trend_growth「末」,
keywords:「始」AI agent,autonomous AI「末」,
threshold:「始」150「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 4. ReviewMiner (差评挖掘器)

**功能**: 抓取 App Store 和 Google Play 的低分评论，发现竞品痛点。

**依赖**: `npm install app-store-scraper google-play-scraper`

**指令**:
- `fetch_ios_reviews` - 获取 iOS 应用差评
- `fetch_android_reviews` - 获取 Android 应用差评
- `search_app` - 搜索应用获取 ID

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」ReviewMiner「末」,
command:「始」fetch_ios_reviews「末」,
appId:「始」333903271「末」,
country:「始」us「末」,
limit:「始」50「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 5. KOLHunter (KOL 搜寻器)

**功能**: 利用 Google 高级搜索在社交平台搜寻 KOL 和潜在客户。

**可选依赖**: 
- `pip install googlesearch-python` (免费但可能被限制)
- 配置 `SERP_API_KEY` (付费但更稳定)

**指令**:
- `find_contacts` - 搜索 KOL 联系方式
- `build_search_query` - 生成搜索指令

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」KOLHunter「末」,
command:「始」find_contacts「末」,
keyword:「始」clay animation「末」,
platform:「始」instagram「末」,
limit:「始」20「末」
<<<[END_TOOL_REQUEST]>>>
```

---

### 6. AdSpy (广告情报)

**功能**: 抓取 Google Ads Transparency Center 的竞品广告创意。

**依赖**: `npm install puppeteer`

**指令**:
- `get_competitor_ads` - 获取竞品广告信息
- `get_transparency_url` - 生成透明度中心链接

**调用示例**:
```
<<<[TOOL_REQUEST]>>>
tool_name:「始」AdSpy「末」,
command:「始」get_competitor_ads「末」,
domain:「始」notion.so「末」,
region:「始」US「末」
<<<[END_TOOL_REQUEST]>>>
```

## ⚙️ 配置说明

每个插件目录下的 `config.env` 文件包含可选配置项：

| 插件 | 配置项 | 说明 |
|------|--------|------|
| CommunityPulse | `REDDIT_CLIENT_ID/SECRET` | Reddit API 凭证 (可选) |
| TrendAlert | `PROXY_URL` | 代理服务器 (访问 Google) |
| KOLHunter | `SERP_API_KEY` | SerpAPI Key (更稳定的搜索) |
| AdSpy | `HEADLESS` | 是否无头模式 (默认 true) |

## 🔧 故障排除

### pytrends 请求被限制
配置代理服务器：在 `TrendAlert/config.env` 中设置 `PROXY_URL`

### Reddit 返回 429 错误
降低请求频率，或注册 Reddit 开发者账号获取 API 凭证

### Puppeteer 启动失败
确保系统安装了 Chrome/Chromium，或设置 `PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true` 使用系统浏览器

### Google 搜索被封
使用 SerpAPI 替代免费搜索库

## 📝 开发说明

所有插件遵循 VCP 同步插件规范：
1. 从 `stdin` 读取 JSON 参数
2. 执行业务逻辑
3. 向 `stdout` 输出 `{status, result}` JSON

详见 `同步异步插件开发手册.md`