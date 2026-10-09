// 本地回测 tmdb-proxy/worker.js（含 /web 面板 + KV 记录）
const fs = require("fs");
const assert = require("assert/strict");

const src = fs.readFileSync(__dirname + "/worker.js", "utf8");
const cleaned = src.replace(/export\s+default/, "module.exports =");
const mod = {};
new Function("module", "exports", "require", "global", cleaned)(mod, mod, require, global);

// 模拟 KV
function makeKV() {
  let m = {};
  return {
    get: async (k, t) => (t === "json" ? (m[k] ? JSON.parse(m[k]) : null) : m[k]),
    put: async (k, v) => { m[k] = String(v); },
  };
}

let captured = [];
global.fetch = async (apiUrl, init) => {
  captured.push({ apiUrl, init });
  return new Response(JSON.stringify({
    id: 73223, name: "黑色四叶草", poster_path: "/abc.jpg",
    results: [
      { id: 37854, name: "航海王", poster_path: "/p1.jpg" },
      { id: 194916, name: "吉伊卡哇", poster_path: "/p2.jpg" },
    ],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
};

(async () => {
  const worker = mod.exports;

  // ① 无 KV 时：反代正常，/web 提示未配置
  delete global.TMDB_LOG;
  captured = [];
  let r = await worker.fetch(new Request("https://p.workers.dev/3/search/tv?api_key=abc&language=zh-CN"));
  assert.ok(captured[0].apiUrl.startsWith("https://api.themoviedb.org/3/search/tv"));
  r = await worker.fetch(new Request("https://p.workers.dev/web"));
  let html = await r.text();
  assert.equal(r.headers.get("Content-Type").includes("text/html"), true);
  assert.ok(html.includes("未配置 KV"));
  console.log("✅ ① 无 KV：反代正常，/web 提示未配置");

  // ② 有 KV：转发 tv 详情会被记录
  global.TMDB_LOG = makeKV();
  await worker.fetch(new Request("https://p.workers.dev/3/tv/73223?api_key=abc&language=zh-CN"));
  let saved = await TMDB_LOG.get("shows", "json");
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, 73223);
  assert.equal(saved[0].title, "黑色四叶草");
  assert.equal(saved[0].poster_path, "/abc.jpg");
  assert.ok(saved[0].added_at);
  console.log("✅ ② 转发 /3/tv/{id} 被记录（id/标题/海报/时间）");

  // ③ tv 搜索：results 全部记录，且去重
  await worker.fetch(new Request("https://p.workers.dev/3/search/tv?api_key=abc&query=x"));
  await worker.fetch(new Request("https://p.workers.dev/3/tv/37854?api_key=abc"));
  saved = await TMDB_LOG.get("shows", "json");
  const ids = saved.map((s) => s.id).sort();
  assert.deepEqual(ids, [37854, 73223, 194916].sort());
  console.log("✅ ③ tv 搜索结果全部记录 + 按 id 去重");

  // ④ /web 面板渲染海报网格，含标题与图片
  r = await worker.fetch(new Request("https://p.workers.dev/web"));
  html = await r.text();
  assert.ok(html.includes("黑色四叶草"));
  assert.ok(html.includes("image.tmdb.org/t/p/w300/abc.jpg"));
  assert.ok(html.includes("KV 已连接"));
  console.log("✅ ④ /web 面板渲染海报 + 标题 + KV 状态");

  // ⑤ 原有功能回归
  captured = [];
  r = await worker.fetch(new Request("https://p.workers.dev/3/tv/73223?api_key=abc"));
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  global.TMDB_API_KEY = "SECRET";
  captured = [];
  r = await worker.fetch(new Request("https://p.workers.dev/3/tv/999?language=zh-CN"));
  assert.ok(captured[0].apiUrl.includes("api_key=SECRET"));
  global.fetch = async () => { throw new Error("boom"); };
  r = await worker.fetch(new Request("https://p.workers.dev/3/tv/1?api_key=a"));
  assert.equal(r.status, 502);
  console.log("✅ ⑤ 原有反代/CORS/注入/502 回归通过");

  console.log("\n全部通过 ✅");
})().catch((e) => { console.error("❌", e); process.exit(1); });
