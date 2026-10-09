/**
 * TMDB API Cloudflare Worker 反向代理 + /web 转发记录面板
 * =====================================================
 * 反向代理 api.themoviedb.org，供中国大陆无法直连的客户端（Rex / fw 等）使用。
 *
 * 额外功能：
 *   - 通过 KV（命名空间名 TMDB_LOG）记录被转发过的剧集（tv 详情 / tv 搜索），去重保存
 *   - 访问 /web 打开网页面板，以 TMDB 海报网格展示转发记录
 *
 * 参考：MoviePilot 官方文档的 TMDB Worker 反代实现（jxxghp/MoviePilot-Wiki）
 *
 * 传 Key 方式：
 *   1) 客户端自带 api_key（默认推荐，Worker 无需配置）
 *   2) 选做：Worker 环境变量 TMDB_API_KEY 自动注入（仅当客户端不方便带 Key 时）
 *
 * 部署：需先在 Cloudflare 创建 KV 命名空间并命名为 TMDB_LOG，绑定到本 Worker。
 * 未配置 KV 时 Worker 照常反代，仅 /web 面板显示“未配置 KV”。
 */

const TMDB_BASE = "https://api.themoviedb.org";
const IMG_BASE = "https://image.tmdb.org/t/p/w300";
const KV_KEY = "shows";
const MAX_RECORDS = 300;

/** 北京时区当前时间字符串 YYYY-MM-DD HH:MM */
function nowStr() {
  return new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }).replace("/", "-").replace("/", "-");
}

/** 从一次被转发的 TV 请求的响应 JSON 里提取剧集条目 */
function extractShows(data, path) {
  const out = [];
  if (path === "/3/search/tv") {
    const list = (data && data.results) || [];
    for (const r of list) {
      if (r && r.id) out.push({ id: r.id, title: r.name || r.original_name || "", poster_path: r.poster_path || "" });
    }
  } else if (/^\/3\/tv\/\d+/.test(path)) {
    if (data && data.id) out.push({ id: data.id, title: data.name || data.original_name || "", poster_path: data.poster_path || "" });
  }
  return out;
}

/** 合并新条目到 KV 记录（按 id 去重，更新最新名称/海报，保留首次时间），cap 上限 */
async function logShows(shows) {
  if (!shows.length) return;
  if (typeof TMDB_LOG === "undefined") return; // 未绑定 KV，仅反代不记录
  try {
    let list = (await TMDB_LOG.get(KV_KEY, "json")) || [];
    const byId = new Map(list.map((s) => [String(s.id), s]));
    for (const s of shows) {
      const key = String(s.id);
      const cur = byId.get(key);
      if (cur) {
        cur.title = s.title || cur.title;
        cur.poster_path = s.poster_path || cur.poster_path;
        cur.last_seen = nowStr();
      } else {
        byId.set(key, { id: s.id, title: s.title, poster_path: s.poster_path, added_at: nowStr(), last_seen: nowStr() });
      }
    }
    let arr = [...byId.values()];
    if (arr.length > MAX_RECORDS) arr = arr.slice(arr.length - MAX_RECORDS);
    await TMDB_LOG.put(KV_KEY, JSON.stringify(arr));
  } catch (e) {
    console.error("[log] fail:", e && e.message);
  }
}

/** /web 面板 HTML：海报网格展示转发过的剧集 */
async function servePanel() {
  let items = [];
  let kvBound = typeof TMDB_LOG !== "undefined";
  if (kvBound) {
    try { items = (await TMDB_LOG.get(KV_KEY, "json")) || []; } catch (e) { items = []; }
  }
  const rows = items
    .map((s) => `<div class="card">
      ${s.poster_path
        ? `<img src="${IMG_BASE}${s.poster_path}" alt="" onerror="this.replaceWith(document.createElement('span'))"/>`
        : `<span class="ph">无海报</span>`}
      <div class="t">${(s.title || "").replace(/[<>&]/g, "")}</div>
      <div class="m">加入 ${s.added_at || "-"}<br/>最近 ${s.last_seen || "-"}</div>
    </div>`)
    .join("");
  const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>TMDB 反代 · 转发记录</title>
<style>
  *{box-sizing:border-box} body{margin:0;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;background:#0f172a;color:#e2e8f0}
  .wrap{max-width:1100px;margin:0 auto;padding:20px}
  h1{font-size:20px} .sub{color:#94a3b8;font-size:13px;margin:4px 0 16px}
  .bar{display:flex;gap:10px;align-items:center;margin-bottom:16px}
  input{flex:1;padding:9px 12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:14px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:14px}
  .card{background:#1e293b;border:1px solid #334155;border-radius:10px;overflow:hidden}
  .card img{width:100%;aspect-ratio:2/3;object-fit:cover;display:block}
  .card .ph{display:flex;width:100%;aspect-ratio:2/3;align-items:center;justify-content:center;color:#64748b;background:#0b1220;font-size:12px}
  .card .t{padding:6px 8px;font-size:12px;line-height:1.3;min-height:34px}
  .card .m{padding:0 8px 8px;font-size:10px;color:#94a3b8}
  .empty{text-align:center;color:#94a3b8;padding:60px 0}
  .kv{display:inline-block;padding:3px 8px;border-radius:6px;font-size:11px;background:${kvBound ? "#14532d" : "#7f1d1d"};color:#bbf7d0;margin-left:8px}
</style></head><body><div class="wrap">
  <h1>TMDB 反代 · 转发记录 <span class="kv">${kvBound ? "KV 已连接" : "未配置 KV（仅反代不记录）"}</span></h1>
  <div class="sub">本面板记录经此 Worker 转发过的剧集（/3/tv 与 /3/search/tv），共 ${items.length} 条，去重、上限 ${MAX_RECORDS} 条。</div>
  <div class="bar"><input id="q" placeholder="按剧名筛选…" oninput="flt(this.value)"/><button onclick="location.reload()" style="padding:9px 14px;border-radius:8px;border:0;background:#2563eb;color:#fff;cursor:pointer">刷新</button></div>
  ${rows ? `<div class="grid" id="g">${rows}</div>` : `<div class="empty">暂无转发记录。用 Rex 打开任意剧集详情后再回来看看。</div>`}
</div>
<script>function flt(v){v=v.toLowerCase();document.querySelectorAll("#g .card").forEach(c=>{c.style.display=c.textContent.toLowerCase().includes(v)?"":"none";});}</script>
</body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // /web 面板
  if (path === "/web" || path === "/web/") return servePanel();

  const params = url.searchParams;
  if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY && !params.has("api_key")) {
    params.set("api_key", TMDB_API_KEY);
  }

  const apiUrl = TMDB_BASE + path + "?" + params.toString();
  const headers = new Headers(request.headers);
  headers.set("Host", "api.themoviedb.org");
  headers.delete("origin");
  headers.delete("referer");

  let resp;
  try {
    resp = await fetch(apiUrl, {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : await request.text(),
    });
  } catch (e) {
    return new Response(JSON.stringify({ status_code: 502, status_message: "upstream error: " + (e && e.message) }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 记录被转发的剧集（只在 tv 详情 / tv 搜索时解析响应）
  const isTV = path === "/3/search/tv" || /^\/3\/tv\/\d+/.test(path);
  let passthrough = resp;
  if (isTV) {
    try {
      const clone = resp.clone();
      const data = await clone.json();
      await logShows(extractShows(data, path));
    } catch (e) {
      console.error("[log-parse] skip:", e && e.message);
    }
    passthrough = resp;
  }

  const newResp = new Response(passthrough.body, passthrough);
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
    "Access-Control-Allow-Headers": "*",
    "Access-Control-Max-Age": "86400",
  };
  Object.entries(cors).forEach(([k, v]) => newResp.headers.set(k, v));
  return newResp;
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
          "Access-Control-Allow-Headers": "*",
          "Access-Control-Max-Age": "86400",
        },
      });
    }
    return handleRequest(request);
  },
};
