#!/usr/bin/env node
"use strict";
/**
 * If Codex is running with CDP, fetch live ChatGPT /models via client.models().
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const OUT = path.join(__dirname, "..", "out", "debug-chatgpt-models.json");

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          reject(e);
        }
      });
    }).on("error", reject);
  });
}
function cdp(wsUrl) {
  let id = 1;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((res, rej) => {
    ws.addEventListener("open", res);
    ws.addEventListener("error", (e) => rej(e.error || e));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  });
  return {
    ready,
    send: async (method, params = {}) => {
      await ready;
      const i = id++;
      return new Promise((resolve, reject) => {
        pending.set(i, { resolve, reject });
        ws.send(JSON.stringify({ id: i, method, params }));
      });
    },
    close: () => ws.close(),
  };
}

async function tryPort(port) {
  const targets = await getJSON(`http://127.0.0.1:${port}/json`);
  const page = targets.find((t) => (t.url || "").includes("app://"));
  if (!page) throw new Error("no page");
  return page.webSocketDebuggerUrl;
}

async function main() {
  let wsUrl;
  for (const port of [9366, 9222, 9229, 9350, 9333, 9400]) {
    try {
      wsUrl = await tryPort(port);
      console.log("cdp", port);
      break;
    } catch {}
  }
  if (!wsUrl) {
    console.log("no CDP — skip live fetch");
    process.exit(0);
  }
  const s = cdp(wsUrl);
  await s.ready;
  await s.send("Runtime.enable");
  const result = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const client = globalThis.__cdrChatClient || (globalThis.__cdrEnsureChatClient && globalThis.__cdrEnsureChatClient());
      if (!client || typeof client.models !== 'function') {
        return { ok:false, reason:'no client', hasClient:!!globalThis.__cdrChatClient };
      }
      // Call raw request if possible to bypass CDRMergeChatModels
      const req = client.request;
      return (async () => {
        let raw = null, merged = null, err = null;
        try {
          if (req && typeof req.getModelsResponse === 'function') {
            raw = await req.getModelsResponse();
          }
        } catch (e) { err = String(e && e.message || e); }
        try { merged = await client.models(); } catch (e) { err = (err||'') + ' | models: ' + String(e && e.message || e); }
        const summarize = (data) => {
          if (!data) return null;
          const opts = [...(data.options||[]), ...(data.internalOptions||[])];
          return {
            defaultModelSlug: data.defaultModelSlug,
            optionCount: opts.length,
            options: opts.slice(0, 40).map(o => ({
              slug: o.slug, title: o.title, selectedLabel: o.selectedLabel,
              thinkingEffort: o.thinkingEffort, lane: o.lane, hidden: o.hidden
            })),
            sliderSettings: (data.sliderSettings||[]).slice(0, 20),
            versionOptions: (data.versionOptions||[]).slice(0, 10).map(v => ({
              id: v.id, label: v.label, defaultModelSlug: v.defaultModelSlug,
              slugs: v.slugs, options: (v.options||[]).slice(0, 10).map(o => ({
                slug: o.slug, title: o.title, selectedLabel: o.selectedLabel, thinkingEffort: o.thinkingEffort, lane: o.lane
              }))
            })),
          };
        };
        const methodNames = (value) => {
          const names = new Set();
          for (let current = value; current && current !== Object.prototype; current = Object.getPrototypeOf(current)) {
            for (const name of Object.getOwnPropertyNames(current)) {
              if (typeof value?.[name] === 'function') names.add(name);
            }
          }
          return [...names].filter(name => /usage|limit|quota|token|message/i.test(name)).sort();
        };
        return { ok:true, err, raw: summarize(raw), merged: summarize(merged), rawKeys: raw && Object.keys(raw), rawModels: raw && raw.models && raw.models.slice(0, 30).map(m => m && ({ slug: m.slug, title: m.title, default_thinking_effort: m.default_thinking_effort })), rawCategories: raw && raw.categories && raw.categories.map(category => ({ keys:Object.keys(category||{}), id:category?.id, title:category?.title, model_lane:category?.model_lane, default_model:category?.default_model, rate_limit:category?.rate_limit, message_cap:category?.message_cap, remaining:category?.remaining, reset_at:category?.reset_at })), rawVersions: raw && raw.versions && raw.versions.map(version => ({ keys:Object.keys(version||{}), id:version?.id, slugs:version?.slugs, rate_limit:version?.rate_limit, message_cap:version?.message_cap, remaining:version?.remaining, reset_at:version?.reset_at })), clientUsageMethods: methodNames(client), requestUsageMethods: methodNames(req) };
      })();
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const value = result.result?.value ?? result.result;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(value, null, 2));
  console.log(JSON.stringify(value, null, 2).slice(0, 8000));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
