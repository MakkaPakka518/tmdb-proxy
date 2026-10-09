// 本地回测 tmdb-proxy/worker.js（模拟 CF Workers 运行时：全局 fetch + Response）
const fs = require("fs");
const assert = require("assert/strict");

const src = fs.readFileSync(__dirname + "/worker.js", "utf8");
// 把 ESM export default 转成 CommonJS 导出，供 require
const cleaned = src.replace(/export\s+default/, "module.exports =");
const mod = {};
new Function("module", "exports", "require", "global", cleaned)(mod, mod, require, global);

let captured = [];
global.fetch = async (apiUrl, init) => {
  captured.push({ apiUrl, init });
  return new Response(JSON.stringify({ page: 1, results: [{ id: 73223, name: "黑色四叶草" }] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

(async () => {
  const worker = mod.exports;

  // 1) 客户端自带 key：路径+query 原样转发，Host 改 api.themoviedb.org
  captured = [];
  let r = await worker.fetch(new Request("https://proxy.workers.dev/3/search/tv?api_key=abc123&language=zh-CN&query=test"));
  let call = captured[0];
  assert.ok(call.apiUrl.startsWith("https://api.themoviedb.org/3/search/tv"));
  assert.ok(call.apiUrl.includes("api_key=abc123"));
  assert.ok(call.apiUrl.includes("language=zh-CN"));
  assert.equal(call.init.headers.get("Host"), "api.themoviedb.org");
  assert.equal(r.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await r.json();
  assert.equal(body.results[0].name, "黑色四叶草");
  console.log("✅ ① 客户端自带 key：转发路径/query + Host + CORS OK");

  // 2) OPTIONS 预检返回 204 + CORS
  r = await worker.fetch(new Request("https://proxy.workers.dev/3/search/tv", { method: "OPTIONS" }));
  assert.equal(r.status, 204);
  assert.equal(r.headers.get("Access-Control-Allow-Methods"), "GET, HEAD, POST, OPTIONS");
  console.log("✅ ② OPTIONS 预检 OK");

  // 3) 环境变量注入 key：客户端不带 api_key 时自动注入
  global.TMDB_API_KEY = "SECRETKEY";
  captured = [];
  r = await worker.fetch(new Request("https://proxy.workers.dev/3/search/tv?language=zh-CN&query=test"));
  assert.ok(captured[0].apiUrl.includes("api_key=SECRETKEY"));
  assert.ok(!captured[0].apiUrl.includes("api_key=abc"));
  console.log("✅ ③ 环境变量自动注入 api_key OK");

  // 4) 上游失败 → 502 JSON
  global.fetch = async () => { throw new Error("boom"); };
  r = await worker.fetch(new Request("https://proxy.workers.dev/3/search/tv?api_key=abc"));
  assert.equal(r.status, 502);
  const j = await r.json();
  assert.equal(j.status_code, 502);
  console.log("✅ ④ 上游异常兜底 502 OK");

  console.log("\n全部通过 ✅");
})().catch((e) => { console.error("❌", e); process.exit(1); });
