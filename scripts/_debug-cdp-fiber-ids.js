#!/usr/bin/env node
"use strict";
/** Dump thread ids from live renderer via deep object walk / known atoms. */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const APP = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
);
const PORT = 9337;
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

async function main() {
  try { execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", { stdio: "ignore" }); } catch {}
  await sleep(700);
  spawn(APP, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" }).unref();
  let targets;
  for (let i = 0; i < 60; i++) {
    try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); if (targets?.length) break; } catch {}
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
      errors.push(d.exception?.description || d.text);
      console.log("EX", String(d.exception?.description || d.text).slice(0, 500));
    }
  });
  await sleep(6000);

  const dumped = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const ids = new Set();
      const titles = [];
      function consider(obj, depth=0) {
        if (!obj || depth>6) return;
        if (typeof obj === 'string') {
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(obj)) ids.add(obj);
          if (obj.startsWith('local:')) ids.add(obj.slice(6));
          return;
        }
        if (typeof obj !== 'object') return;
        if (Array.isArray(obj)) { for (const x of obj.slice(0,50)) consider(x, depth+1); return; }
        // conversation-like
        if (typeof obj.id === 'string' && (obj.title || obj.cwd || obj.turns || obj.mode)) {
          ids.add(obj.id.replace(/^local:/,''));
          if (obj.title) titles.push({id: obj.id, title: String(obj.title).slice(0,60)});
        }
        if (obj.conversationId) ids.add(String(obj.conversationId).replace(/^local:/,''));
        if (obj.threadId) ids.add(String(obj.threadId).replace(/^local:/,''));
        const keys = Object.keys(obj).slice(0, 40);
        for (const k of keys) {
          if (/id|thread|conversation|recent/i.test(k)) consider(obj[k], depth+1);
        }
      }
      // Walk likely globals
      for (const k of Object.getOwnPropertyNames(window)) {
        if (/codex|cdr|store|atom|conversation|thread/i.test(k)) {
          try { consider(window[k], 0); } catch {}
        }
      }
      try { consider(window.__cdrChatClient, 0); } catch {}
      try { consider(window.__cdrLocalModeV4, 0); } catch {}
      // React fiber root scan for conversation ids in props/memoizedState — limited
      const rootEl = document.getElementById('root') || document.querySelector('#app') || document.body;
      const fiberKey = Object.keys(rootEl).find(k => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'));
      let fiber = fiberKey ? rootEl[fiberKey] : null;
      let steps = 0;
      while (fiber && steps < 4000) {
        steps++;
        try {
          const p = fiber.memoizedProps || fiber.pendingProps;
          if (p) consider(p, 0);
          const st = fiber.memoizedState;
          let s = st, n=0;
          while (s && n < 30) { consider(s.memoizedState, 0); consider(s.queue, 0); s = s.next; n++; }
        } catch {}
        fiber = fiber.child || fiber.sibling || (fiber.return && fiber.return.sibling) || null;
        // safer BFS-ish
      }
      // Simpler BFS fiber
      const q = [];
      const seen = new Set();
      const startKey = Object.keys(document.documentElement).find(k => k.startsWith('__react'))
        || Object.keys(document.body).find(k => k.startsWith('__react'));
      if (startKey) q.push(document.body[startKey] || document.documentElement[startKey]);
      let visited = 0;
      while (q.length && visited < 8000) {
        const f = q.shift();
        if (!f || seen.has(f)) continue;
        seen.add(f); visited++;
        try {
          consider(f.memoizedProps, 0);
          let s = f.memoizedState, n=0;
          while (s && n < 20) { consider(s.memoizedState, 1); s = s.next; n++; }
        } catch {}
        if (f.child) q.push(f.child);
        if (f.sibling) q.push(f.sibling);
      }
      return {
        ids: [...ids].slice(0, 30),
        titles: titles.slice(0, 20),
        href: location.href,
        bodyHasChats: /Chats|Scoutly|Locate custom/i.test(document.body.innerText||''),
        globals: Object.getOwnPropertyNames(window).filter(k=>/codex|cdr|store|atom/i.test(k)).slice(0,40),
      };
    })()`,
    returnByValue: true,
    awaitPromise: false,
  });
  console.log(JSON.stringify(dumped.result?.value, null, 2));

  const ids = dumped.result?.value?.ids || [];
  const navs = [];
  for (const id of ids.slice(0, 5)) {
    console.log("NAV", id);
    await s.send("Page.navigate", { url: `app://-/local/${id}` });
    await sleep(4000);
    const st = await s.send("Runtime.evaluate", {
      expression: `({href:location.href, oops:/Oops, an error/i.test(document.body.innerText||''), body:(document.body.innerText||'').slice(0,600), err:window.__cdrE||null})`,
      returnByValue: true,
    });
    console.log(st.result?.value);
    navs.push({ id, st: st.result?.value });
    if (st.result?.value?.oops) break;
  }

  fs.writeFileSync(path.join(__dirname, "..", "out", "debug-fiber-ids.json"), JSON.stringify({ dumped: dumped.result?.value, errors, navs }, null, 2));
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
