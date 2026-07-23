#!/usr/bin/env node
"use strict";
/** Open known local thread IDs (ULIDs) and check for Oops / cdr-last-error. */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const APP = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
);
const PORT = 9346;
const IDS = [
  "019f63f6-d566-7bf2-943f-1630d7f490d2",
  "019f6df0-f518-78f0-98d7-4290449f717c",
  "019f8108-ad15-75d1-a303-9c6864de523b",
];
const OUT = path.join(__dirname, "..", "out", "debug-v52-ulid-open.json");
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
  await sleep(1000);
  spawn(APP, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" }).unref();
  let page;
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
      page = targets.find((t) => (t.url || "").includes("app://"));
      if (page) break;
    } catch {}
    await sleep(500);
  }
  const s = cdp(page.webSocketDebuggerUrl);
  await s.ready;
  await s.send("Runtime.enable");
  const errors = [];
  s.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails || {};
      errors.push(d.exception?.description || d.text);
      console.log("EX", String(d.exception?.description || d.text).slice(0, 1000));
    }
  });
  await sleep(8000);

  const results = [];
  for (const mode of ["codex", "chat"]) {
    for (const id of IDS) {
      console.log("open", mode, id);
      await s.send("Runtime.evaluate", {
        expression: `(() => {
          localStorage.removeItem('cdr-last-error');
          localStorage.setItem('cdr-product-mode', ${JSON.stringify(mode)});
          try { CDRRuntime.setMode(${JSON.stringify(mode)}); } catch {}
          const path = '/local/' + ${JSON.stringify(id)};
          // Prefer in-app router via history + popstate and any Link onClick
          try {
            window.history.pushState({}, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          } catch {}
          // Also try assigning via location for electron custom protocol apps that listen
          try {
            const ev = new CustomEvent('cdr-force-route', { detail: { path } });
            window.dispatchEvent(ev);
          } catch {}
          return location.href;
        })()`,
        returnByValue: true,
      });
      await sleep(5000);
      const snap = await s.send("Runtime.evaluate", {
        expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,800)})`,
        returnByValue: true,
      });
      console.log(JSON.stringify(snap.result?.value).slice(0, 400));
      results.push({ mode, id, snap: snap.result?.value });
      if (snap.result?.value?.oops || snap.result?.value?.last) {
        fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
        console.log("CAUGHT", OUT);
        s.close();
        return;
      }
    }
  }
  fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
