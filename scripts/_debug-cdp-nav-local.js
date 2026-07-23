#!/usr/bin/env node
"use strict";
/**
 * Extract recent local thread ids from profile / asar runtime state, then
 * navigate CDP directly to /local/:id and capture Oops.
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const APP = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
);
const PORT = 9336;
const OUT = path.join(__dirname, "..", "out", "debug-cdp-nav-local.json");
const PROFILE = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Profile",
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => resolve(JSON.parse(d)));
    }).on("error", reject);
  });
}
function cdp(wsUrl) {
  let id = 1;
  const pending = new Map();
  const listeners = new Set();
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
    for (const fn of listeners) fn(msg);
  });
  return {
    ready,
    on: (fn) => listeners.add(fn),
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

function findUuidsInDir(dir, limit = 30) {
  const ids = new Set();
  const re = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  function walk(p, depth = 0) {
    if (ids.size >= limit || depth > 4) return;
    let ents;
    try {
      ents = fs.readdirSync(p, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of ents) {
      if (ids.size >= limit) break;
      const fp = path.join(p, ent.name);
      if (ent.isDirectory()) {
        if (/Cache|Code Cache|GPU|blob|Crashpad|Shader/i.test(ent.name)) continue;
        walk(fp, depth + 1);
      } else if (ent.isFile() && ent.size < 5_000_000) {
        // filenames often contain thread ids
        for (const m of ent.name.matchAll(re)) ids.add(m[0]);
        if (/\.(log|ldb|txt|json)$/i.test(ent.name) || !path.extname(ent.name)) {
          try {
            const buf = fs.readFileSync(fp);
            const s = buf.toString("utf8");
            // only scan if looks like text-ish
            if (s.includes("local:") || s.includes("/local/") || /thread/i.test(ent.name)) {
              for (const m of s.matchAll(re)) {
                ids.add(m[0]);
                if (ids.size >= limit) return;
              }
            }
          } catch {}
        }
      }
    }
  }
  walk(dir);
  return [...ids];
}

async function main() {
  // Prefer ids from Local Storage via strings in leveldb logs
  const lsDir = path.join(PROFILE, "Default/Local Storage/leveldb");
  const ids = findUuidsInDir(lsDir, 40);
  console.log("candidate ids", ids.slice(0, 15));

  try {
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", { stdio: "ignore" });
  } catch {}
  await sleep(800);
  spawn(APP, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" }).unref();

  let targets;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
      if (targets?.length) break;
    } catch {}
    await sleep(400);
  }
  const page = targets.find((t) => (t.url || "").includes("app://")) || targets[0];
  const s = cdp(page.webSocketDebuggerUrl);
  await s.ready;
  await s.send("Runtime.enable");
  const errors = [];
  s.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails || {};
      errors.push({
        text: d.text,
        exception: d.exception?.description || d.exception?.value,
      });
      console.log("EX", String(d.exception?.description || d.text).slice(0, 800));
    }
  });
  await sleep(4000);

  // Get live thread ids from the app itself
  const live = await s.send("Runtime.evaluate", {
    expression: `(() => {
      window.__cdrE=[];
      window.addEventListener('error',e=>window.__cdrE.push({t:'err',m:String(e.message),s:String(e.error&&e.error.stack||'')}));
      window.addEventListener('unhandledrejection',e=>window.__cdrE.push({t:'rej',m:String(e.reason&&e.reason.message||e.reason),s:String(e.reason&&e.reason.stack||'')}));
      localStorage.setItem('cdr-product-mode','codex');
      try{CDRRuntime&&CDRRuntime.setMode&&CDRRuntime.setMode('codex')}catch{}
      // Try to read recent conversations from any exposed globals / jotai
      const ids=[];
      try {
        const raw = localStorage.getItem('cdr-thread-map');
        if (raw) {
          const m = JSON.parse(raw);
          for (const k of Object.keys(m.byLocal||{})) ids.push(k.replace(/^local:/,''));
        }
      } catch {}
      return {href:location.href, ids, mode:localStorage.getItem('cdr-product-mode')};
    })()`,
    returnByValue: true,
  });
  console.log("live", live.result?.value);

  let tryIds = [];
  try {
    tryIds = (live.result?.value?.ids || []).filter(Boolean);
  } catch {}
  if (!tryIds.length) tryIds = ids.slice(0, 8);
  if (!tryIds.length) {
    // last resort: ask the renderer for atom/thread list via DOM data
    const scraped = await s.send("Runtime.evaluate", {
      expression: `(() => {
        const out=[];
        const html=document.documentElement.innerHTML;
        for (const m of html.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi)) out.push(m[0]);
        return [...new Set(out)].slice(0,20);
      })()`,
      returnByValue: true,
    });
    tryIds = scraped.result?.value || [];
    console.log("scraped", tryIds);
  }

  const navResults = [];
  for (const id of tryIds.slice(0, 6)) {
    const url = `app://-/local/${id}`;
    console.log("NAV", url);
    await s.send("Page.navigate", { url });
    await sleep(4500);
    const st = await s.send("Runtime.evaluate", {
      expression: `(() => {
        const text=document.body?document.body.innerText:'';
        return {
          href: location.href,
          oops: /Oops, an error/i.test(text),
          body: text.slice(0, 700),
          errors: window.__cdrE||[],
        };
      })()`,
      returnByValue: true,
    });
    console.log("ST", JSON.stringify(st.result?.value).slice(0, 500));
    navResults.push({ id, state: st.result?.value });
    if (st.result?.value?.oops || (st.result?.value?.errors || []).length) break;
  }

  // Also try chat mode open of same ids
  if (tryIds[0] && !navResults.some((r) => r.state?.oops)) {
    await s.send("Runtime.evaluate", {
      expression: `localStorage.setItem('cdr-product-mode','chat'); try{CDRRuntime.setMode('chat')}catch{}`,
    });
    await sleep(500);
    const id = tryIds[0];
    await s.send("Page.navigate", { url: `app://-/local/${id}` });
    await sleep(4500);
    const st = await s.send("Runtime.evaluate", {
      expression: `(() => {
        const text=document.body?document.body.innerText:'';
        return {href:location.href, oops:/Oops, an error/i.test(text), body:text.slice(0,700), errors:window.__cdrE||[]};
      })()`,
      returnByValue: true,
    });
    console.log("CHAT NAV", JSON.stringify(st.result?.value).slice(0, 500));
    navResults.push({ id, mode: "chat", state: st.result?.value });
  }

  fs.writeFileSync(OUT, JSON.stringify({ tryIds, errors, navResults }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
