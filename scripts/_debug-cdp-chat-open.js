#!/usr/bin/env node
"use strict";
/** Click a Chat-mode sidebar chat and capture Oops / exceptions. */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");
const APP = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
);
const PORT = 9335;
const OUT = path.join(__dirname, "..", "out", "debug-cdp-chat-open.json");
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
  await sleep(800);
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
      errors.push({ text: d.text, exception: d.exception?.description || d.exception?.value });
      console.log("EX", String(d.exception?.description || d.text).slice(0, 600));
    }
  });
  await sleep(5000);

  // Force chat mode and wait for sidebar chats
  await s.send("Runtime.evaluate", {
    expression: `(() => {
      window.__cdrE=[];
      window.addEventListener('error',e=>window.__cdrE.push({t:'err',m:String(e.message),s:String(e.error&&e.error.stack||'')}));
      window.addEventListener('unhandledrejection',e=>window.__cdrE.push({t:'rej',m:String(e.reason&&e.reason.message||e.reason),s:String(e.reason&&e.reason.stack||'')}));
      localStorage.setItem('cdr-product-mode','chat');
      try{CDRRuntime&&CDRRuntime.setMode&&CDRRuntime.setMode('chat')}catch{}
      for (const el of document.querySelectorAll('*')) {
        if ((el.textContent||'').trim()==='Chat' && el.childNodes.length<=3) { el.click(); break; }
      }
      return 'chat';
    })()`,
  });
  await sleep(2500);

  // Click several chat titles
  const titles = [
    "Locate custom Codex app files",
    "Reverse engineer the codex",
    "hi",
    "Scoutly",
    "Disable Supabase",
  ];
  const results = [];
  for (const title of titles) {
    const find = await s.send("Runtime.evaluate", {
      expression: `(() => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while (n = w.nextNode()) {
          const v = (n.nodeValue||'').trim();
          if (!v.includes(${JSON.stringify(title.slice(0, 12))})) continue;
          let el = n.parentElement;
          let best = el;
          for (let i=0;i<12 && el;i++) {
            const r = el.getBoundingClientRect();
            if (r.width>40 && r.height>18 && r.height<120 && r.x < 420) best = el;
            el = el.parentElement;
          }
          const r = best.getBoundingClientRect();
          return {ok:true, text:v.slice(0,80), x:r.x+r.width/2, y:r.y+r.height/2, w:r.width, h:r.height, tag:best.tagName};
        }
        return {ok:false};
      })()`,
      returnByValue: true,
    });
    console.log("find", title, find.result?.value);
    let box = find.result?.value;
    if (!box || !box.ok || !(box.x > 0)) continue;
    await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
    await sleep(3500);
    const end = await s.send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body.innerText||'';
        return {
          href: location.href,
          oops: /Oops, an error/i.test(text),
          body: text.slice(0, 500),
          errors: window.__cdrE||[],
        };
      })()`,
      returnByValue: true,
    });
    console.log("after", title, end.result?.value);
    results.push({ title, box, end: end.result?.value });
    if (end.result?.value?.oops || (end.result?.value?.errors||[]).length) break;
  }

  fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
  console.log("wrote", OUT, "exceptions", errors.length);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
