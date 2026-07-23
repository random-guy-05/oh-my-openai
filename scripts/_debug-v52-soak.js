#!/usr/bin/env node
"use strict";
/** Longer soak on /local/:id open — catch delayed Oops. */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const APP = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
);
const PORT = 9347;
const ID = "019f8108-ad15-75d1-a303-9c6864de523b";
const OUT = path.join(__dirname, "..", "out", "debug-v52-soak.json");
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
  await sleep(7000);
  await s.send("Runtime.evaluate", {
    expression: `localStorage.setItem('cdr-product-mode','codex'); try{CDRRuntime.setMode('codex')}catch{}; localStorage.removeItem('cdr-last-error'); history.pushState({},'','/local/${ID}'); dispatchEvent(new PopStateEvent('popstate'));`,
  });
  const snaps = [];
  for (const wait of [2, 5, 10, 15]) {
    await sleep(wait === 2 ? 2000 : 3000);
    const snap = await s.send("Runtime.evaluate", {
      expression: `({t:${wait},href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,1000)})`,
      returnByValue: true,
    });
    console.log(JSON.stringify(snap.result?.value).slice(0, 450));
    snaps.push(snap.result?.value);
  }
  fs.writeFileSync(OUT, JSON.stringify({ errors, snaps }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
