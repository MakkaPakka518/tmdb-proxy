/**
 * TMDB API Cloudflare Worker 反向代理
 * =====================================
 * 让中国大陆无法直连 api.themoviedb.org 的客户端（浏览器 / Rex / fw 等）
 * 通过本 Worker 访问 TMDB，把请求路径 + query 原样转发到官方 API。
 *
 * 参考：MoviePilot 官方文档的 TMDB Worker 反代实现（jxxghp/MoviePilot-Wiki）
 *
 * 两种用法：
 *   1) 客户端自带 api_key（推荐，与官方完全一致）：
 *        https://<你的worker域名>.workers.dev/3/search/movie?api_key=你的KEY&language=zh-CN&query=xxx
 *   2) 在 Worker 环境变量里配置 TMDB_API_KEY 自动注入（客户端不用带 key）：
 *        https://<你的worker域名>.workers.dev/3/search/movie?language=zh-CN&query=xxx
 */

const TMDB_BASE = "https://api.themoviedb.org";

async function handleRequest(request) {
  const url = new URL(request.url);
  const path = url.pathname; // 例如 /3/search/movie
  const params = url.searchParams;

  // 可选：若在 Worker 配置了 TMDB_API_KEY 环境变量，且客户端未带 api_key，则自动注入
  if (typeof TMDB_API_KEY !== "undefined" && TMDB_API_KEY && !params.has("api_key")) {
    params.set("api_key", TMDB_API_KEY);
  }

  const apiUrl = TMDB_BASE + path + "?" + params.toString();

  const headers = new Headers(request.headers);
  headers.set("Host", "api.themoviedb.org");
  // 删除可能干扰转发的 hop-by-hop / 敏感头
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

  // 透传 TMDB 响应，并附加 CORS 头（供浏览器端跨域调用）
  const newResp = new Response(resp.body, resp);
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
