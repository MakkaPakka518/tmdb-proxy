# TMDB API 反向代理 · Cloudflare Worker

让中国大陆无法直连 `api.themoviedb.org` 的客户端，通过一个 Cloudflare Worker 反向代理访问 TMDB API。

参考实现：MoviePilot 官方文档的 TMDB Worker 反代（[jxxghp/MoviePilot-Wiki](https://github.com/jxxghp/MoviePilot-Wiki)）。

## 特性

- 请求路径 + query 原样转发到 `api.themoviedb.org`，行为与官方 API 完全一致
- 支持 GET / HEAD / POST
- 自动附带 CORS 头，浏览器端（Rex / fw 网页等）可跨域调用
- 支持两种传 Key 方式：客户端自带 `api_key`，或 Worker 环境变量自动注入
- 零依赖，单文件

## 部署

### 方式一：Cloudflare 控制台（最简单，推荐）

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → 创建 Worker
2. 把本仓库的 `worker.js` 内容整体粘贴进代码编辑器，保存并部署
3. 记下生成的域名，例如 `https://tmdb-proxy.xxx.workers.dev`

可选：到 Worker → 设置 → 变量，添加环境变量 `TMDB_API_KEY = 你的Key`，之后客户端无需再带 `api_key`。

### 方式二：Wrangler CLI

```bash
npm i -g wrangler
wrangler login
wrangler deploy
```

如需注入 Key，先在 `wrangler.toml` 的 `[vars]` 里填 `TMDB_API_KEY`，或 `wrangler secret put TMDB_API_KEY`。

## 使用

和直接调 TMDB 官方 API 完全一样，只是把域名换成你的 Worker 域名：

```bash
# 客户端自带 key
curl "https://tmdb-proxy.xxx.workers.dev/3/search/movie?api_key=你的KEY&language=zh-CN&query=spy%20x%20family"

# 若已配置 TMDB_API_KEY 环境变量，则无需带 key
curl "https://tmdb-proxy.xxx.workers.dev/3/search/tv?language=zh-CN&query=%E5%86%B0%E4%B9%8B%E5%9F%8E%E5%A2%99"
```

常见端点（`/3/...` 之后与官方一致）：

- 搜索剧集：`/3/search/tv?query=xxx`
- 搜索电影：`/3/search/movie?query=xxx`
- 剧集详情（中文简介）：`/3/tv/{tv_id}?language=zh-CN`
- 剧集详情（中文）：`/3/tv/{tv_id}?language=zh-CN`
- 剧集外文别名：`/3/tv/{tv_id}/translations`
- 热播榜：`/3/trending/all/week`

> 注意：`language=zh-CN` 可拿到中文剧名与简介；部分冷门作品 TMDB 中文库可能没有译名，会回退英文/原文。

## 版权 / 说明

本 Worker 为学习用途的 API 反代，请遵守 [TMDB 使用条款](https://www.themoviedb.org/terms-of-use) 与 API 用量限制。请勿用于规避订阅、转售或任何商业用途。
