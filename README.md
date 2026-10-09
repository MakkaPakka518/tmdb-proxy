# TMDB API 反向代理 · Cloudflare Worker

让中国大陆无法直连 `api.themoviedb.org` 的客户端，通过一个 Cloudflare Worker 反向代理访问 TMDB API。

参考实现：MoviePilot 官方文档的 TMDB Worker 反代（[jxxghp/MoviePilot-Wiki](https://github.com/jxxghp/MoviePilot-Wiki)）。

## 特性

- 请求路径 + query 原样转发到 `api.themoviedb.org`，行为与官方 API 完全一致
- 支持 GET / HEAD / POST
- 自动附带 CORS 头，浏览器端（Rex / fw 网页等）可跨域调用
- 传 Key 方式：**默认由客户端自带 `api_key`**（Rex 等直接填 Key 即可，Worker 无需配置）；`TMDB_API_KEY` 环境变量自动注入为**选做**项（仅当客户端不方便带 Key 时用）
- **`/web` 转发记录面板**：访问 `<worker>/web/history` 以海报网格查看转发过的剧集（需 KV，选做）
- **内置影视推荐站 `/web`**：访问 `<worker>/web` 打开移动端影视推荐页（TMDB+Trakt），其 TMDB 请求走本 Worker（自动记录到历史、大陆可用），页头含「反代历史」按钮直达 `/web/history`
- **自动补 `/3`**：无论客户端/页面自带 `/3` 与否都能用（见下）
- 零依赖，单文件

## 转发记录面板（/web/history）

部署后可访问 `https://<你的域名>/web/history` 打开历史面板，以 TMDB 海报网格展示**经此 Worker 转发过的剧集**（`/3/tv` 详情 与 `/3/search/tv` 搜索），并记录加入/最近访问时间，支持按剧名筛选、最多保留 300 条、按 id 去重。

该功能依赖 **Cloudflare KV**，但 KV 配置是**选做**的：

- **不配置 KV**：完全不影响 TMDB 反代功能，历史页面会提示「未配置 KV（仅反代不记录）」。
- **配置 KV（推荐，启用记录）**：
  1. Cloudflare 控制台 → Workers & Pages → **KV** → 创建命名空间，名称填 `TMDB_LOG`
  2. 打开本 Worker → 设置 → **变量和机密** → **KV 命名空间绑定** → 添加绑定 `TMDB_LOG` → 选择刚建的命名空间
  3. 重新部署/保存生效

> 面板记录的是「被转发的剧集请求」，也就是 Rex/fw 打开某部剧的详情时产生的。想看到记录，先让 Rex 走这个地址打开几部剧，再回来看 `/web/history`。

## 内置影视推荐站（/web）

部署后访问 `https://<你的域名>/web` 即可打开一个**移动端影视推荐站**（电影/剧集榜单、搜索、详情、Trakt 片单）。它是内嵌在 Worker 里的（`site.html`），好处：

- 站点里的 **TMDB 请求全部走本 Worker**（同源），既能在大陆直接访问，又会被自动记入转发历史
- 页面头部有 **「反代历史」按钮**（时钟图标），点击直达 `/web/history`，查看你浏览过的剧
- 详情页自带 **「在 Rex 观看」** 跳转
- 历史面板页头有「剧集推荐」按钮可切回 `/web`

浏览流程：打开 `/web` → 随便点开几部剧的详情 → 点页头「反代历史」，就能看到刚才浏览过的剧（以海报网格列出，支持按剧名筛选）。

> 面板/历史仍需 KV 记录才有效（KV 配置见上，选做）；不配 KV 时站点与反代照常工作，只是历史不记录。

## 自动补 /3（兼容 Rex 是否自带 /3）

本 Worker 对 **`/web` 以外的所有路径都视为 TMDB API**，并**自动补齐 `/3` 前缀**：

- 自带 `/3`：`/3/tv/73223` → 转发 `api.themoviedb.org/3/tv/73223`（正常）
- 不带 `/3`：`/tv/73223` → 自动补成 `/3/tv/73223` 再转发

所以你**不用管 Rex/fw 到底拼不拼 `/3`**，两种情况都兼容。根路径 `/` 同样留给反代自适应（空路径也会补成 `/3` 转发）。

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

默认 `xxx.workers.dev` 域名在部分地区（含大陆）访问不稳定，建议绑定一个自己的域名（此方法比直接 CNAME 到 workers.dev 更快更稳）。

前提：你的域名 DNS 托管在 Cloudflare（免费版即可）。

按下面几步：

1. Worker 详情 → **设置** → **域和路由**
2. 点击 **添加自定义域**，选择你已接入 Cloudflare 的域名并指定子域，把路由的 `*.你的域名/*` 改成 `自定义前缀.你的域名/*` 这种格式，例如：`tmdb.example.com/*`
3. 到 Cloudflare **域名概览**，选择你刚添加到 Worker 的域名，点击 **DNS 记录**，添加一条 **CNAME 记录**：前缀填你刚刚自定义的前缀，**关闭小黄云**，目标填入 `saas.sin.fan`
4. 完成后，你就可以通过自定义域名访问面板和反代地址了，例如 `https://tmdb.example.com`

> 提示：自定义域名比 `workers.dev` 域名在国内被墙的概率更低、访问更快，手机端 Rex/fw 走自定义域名体验更好。

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
