# TMDB API 反向代理 · Cloudflare Worker

让中国大陆无法直连 `api.themoviedb.org` 的客户端，通过一个 Cloudflare Worker 反向代理访问 TMDB API。

参考实现：MoviePilot 官方文档的 TMDB Worker 反代（[jxxghp/MoviePilot-Wiki](https://github.com/jxxghp/MoviePilot-Wiki)）。

## 特性

- 请求路径 + query 原样转发到 `api.themoviedb.org`，行为与官方 API 完全一致
- 支持 GET / HEAD / POST
- 自动附带 CORS 头，浏览器端（Rex / fw 网页等）可跨域调用
- 传 Key 方式：**默认由客户端自带 `api_key`**（Rex 等直接填 Key 即可，Worker 无需配置）；`TMDB_API_KEY` 环境变量自动注入为**选做**项（仅当客户端不方便带 Key 时用）
- **`/web` 转发记录面板**：访问 `<worker>/web` 以海报网格查看转发过的剧集（需 KV，选做）
- 零依赖，单文件

## 转发记录面板（/web）

部署后可访问 `https://<你的域名>/web` 打开面板，以 TMDB 海报网格展示**经此 Worker 转发过的剧集**（`/3/tv` 详情 与 `/3/search/tv` 搜索），并记录加入/最近访问时间，支持按剧名筛选、最多保留 300 条、按 id 去重。

该功能依赖 **Cloudflare KV**，但 KV 配置是**选做**的：

- **不配置 KV**：完全不影响 TMDB 反代功能，`/web` 页面会提示「未配置 KV（仅反代不记录）」。
- **配置 KV（推荐，启用记录）**：
  1. Cloudflare 控制台 → Workers & Pages → **KV** → 创建命名空间，名称填 `TMDB_LOG`
  2. 打开本 Worker → 设置 → **变量和机密** → **KV 命名空间绑定** → 添加绑定 `TMDB_LOG` → 选择刚建的命名空间
  3. 重新部署/保存生效

> 面板记录的是「被转发的剧集请求」，也就是 Rex/fw 打开某部剧的详情时产生的。想看到记录，先让 Rex 走这个地址打开几部剧，再回来看 `/web`。

## 部署

### 方式一：Cloudflare 控制台（最简单，推荐）

1. 打开 [dash.cloudflare.com](https://dash.cloudflare.com) → Workers & Pages → 创建 Worker
2. 把本仓库的 `worker.js` 内容整体粘贴进代码编辑器，保存并部署
3. 记下生成的域名，例如 `https://tmdb-proxy.xxx.workers.dev`

**默认无需任何配置**：客户端（Rex / fw / curl）直接在请求里带 `api_key` 即可，Worker 原样转发给 TMDB，完全兼容。

**选做**：若你不想在客户端填 Key，可到 Worker → 设置 → 变量，添加环境变量 `TMDB_API_KEY = 你的Key`，由 Worker 在客户端没带 Key 时自动注入。

### 方式二：Wrangler CLI

```bash
npm i -g wrangler
wrangler login
wrangler deploy
```

如需注入 Key，先在 `wrangler.toml` 的 `[vars]` 里填 `TMDB_API_KEY`，或 `wrangler secret put TMDB_API_KEY`。

## 绑定自定义域名（推荐）

默认 `xxx.workers.dev` 域名在部分地区（含大陆）访问不稳定，建议绑定一个自己的域名。

### 前提
你的域名 DNS 托管在 Cloudflare（免费版即可）。

### 方式一：Worker 自带「自定义域」功能（最简单）

1. 打开 Worker → 设置 → **域和路由** → **添加自定义域**（Add custom domain）
2. 输入你想用的子域，例如 `tmdb.<你的域名>.com`
3. Cloudflare 会自动在该域名的 DNS 里创建一条 CNAME 记录指向你的 Worker，并自动签发 HTTPS 证书，等状态变为 **Active** 即可

完成后你的访问地址就是：
```
https://tmdb.<你的域名>.com
```

### 方式二：手动加路由

1. DNS 里新建一条记录（可先加 CNAME，`tmdb.<你的域名>.com` → `tmdb-proxy.<你的账号>.workers.dev`，代理状态开启 ⚡）
2. Worker → 设置 → 域和路由 → 添加路由（Route），填写：
   ```
   tmdb.<你的域名>.com/*
   ```
3. 等待证书生效（通常几十秒~几分钟）

> 提示：自定义域名比 `workers.dev` 域名在国内被墙的概率更低、也更稳定，手机端 Rex/fw 走自定义域名体验更好。

## 使用

和直接调 TMDB 官方 API 完全一样，只是把域名换成你的 Worker 域名。**默认客户端带 `api_key`，Worker 无需配 Key 变量**：

```bash
# 客户端自带 key（默认方式，最推荐）
curl "https://tmdb-proxy.xxx.workers.dev/3/search/movie?api_key=你的KEY&language=zh-CN&query=spy%20x%20family"

# 选做：仅在 Worker 配了 TMDB_API_KEY 环境变量时，客户端可不带 key
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

## 接入 Rex / fw（自定义 TMDB API）

Rex 等观影应用支持「自定义 TMDB API」，把它的 API 地址指向本 Worker 即可让详情页 / 海报解析走你的反代，绕过大陆直连限制。

在 Rex 的 **数据与资源 → 内容加载 → 自定义 TMDB API** 里填写：

| 项目 | 填什么 |
|------|--------|
| **API 地址** | `https://tmdb.<你的域名>.com`（若没绑自定义域名则用 `https://tmdb-proxy.<你的账号>.workers.dev`）|
| **API Key** | 填你原来的 TMDB API Key（不变）|

然后点 **测试连接并保存**。

> ⚠️ API 地址**不要带 `/3`**（Rex 会自动拼 `/3/...`，和原来填 `https://api.themoviedb.org` 保持一致，只换域名即可）。
> 默认**兼容客户端填 Key**：Rex 里填的 API Key 会被原样转发给 TMDB，Worker 无需配任何变量。Worker 的 `TMDB_API_KEY` 环境变量是**选做**项，仅当你不想在客户端填 Key 时才需要配置。

保存后，Rex 里所有带 TMDB id 的条目（AniList / MAL / 榜单等）的详情与海报解析都会走你的 Worker。

## 版权 / 说明

本 Worker 为学习用途的 API 反代，请遵守 [TMDB 使用条款](https://www.themoviedb.org/terms-of-use) 与 API 用量限制。请勿用于规避订阅、转售或任何商业用途。
