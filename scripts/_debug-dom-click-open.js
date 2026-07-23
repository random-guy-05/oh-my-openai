#!/usr/bin/env node
"use strict";
/**
 * Force open thread via DOM element.click() after expanding project.
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
const PORT = 9345;
const OUT = path.join(__dirname, "..", "out", "debug-dom-click-open.json");
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
      console.log("EX", String(d.exception?.description || d.text).slice(0, 1200));
    }
  });

  for (let i = 0; i < 25; i++) {
    const r = await s.send("Runtime.evaluate", {
      expression: `(document.body&&document.body.innerText||'').includes('Scoutly')`,
      returnByValue: true,
    });
    if (r.result?.value) break;
    await sleep(2000);
  }

  const result = await s.send("Runtime.evaluate", {
    expression: `(() => {
      localStorage.removeItem('cdr-last-error');
      localStorage.setItem('cdr-product-mode','codex');
      try { CDRRuntime.setMode('codex'); } catch {}

      function findClickable(substr) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while (n = w.nextNode()) {
          if (!(n.nodeValue || '').includes(substr)) continue;
          let el = n.parentElement;
          let best = el;
          for (let i = 0; i < 14 && el; i++) {
            const r = el.getBoundingClientRect();
            if (r.width > 40 && r.height > 16 && r.height < 120 && r.x < 420) best = el;
            // prefer elements with listeners / button role
            if (el.getAttribute && (el.getAttribute('role') === 'button' || el.tagName === 'BUTTON' || el.tagName === 'A')) best = el;
            el = el.parentElement;
          }
          return best;
        }
        return null;
      }

      const log = [];
      const scoutly = findClickable('Scoutly');
      if (scoutly) { scoutly.click(); log.push('clicked Scoutly'); }
      return new Promise((resolve) => {
        setTimeout(() => {
          const titles = [
            'Disable Supabase temporarily',
            'Draft ScoutingIQ outreach email',
            'Update main logo',
            'Lets generate some figures',
            'Refine OSA manuscript',
            'Summarize latest run results',
            'what was the error that came',
          ];
          let clicked = null;
          for (const t of titles) {
            const el = findClickable(t.slice(0, 16));
            if (!el) continue;
            try {
              el.click();
              clicked = t;
              log.push('clicked ' + t);
              break;
            } catch (e) {
              log.push('click err ' + e);
            }
          }
          setTimeout(() => {
            resolve({
              log,
              clicked,
              href: location.href,
              title: document.title,
              oops: /Oops, an error/i.test(document.body.innerText || ''),
              last: localStorage.getItem('cdr-last-error'),
              body: (document.body.innerText || '').slice(0, 1200),
            });
          }, 4500);
        }, 1500);
      });
    })()`,
    returnByValue: true,
    awaitPromise: true,
  });
  console.log(JSON.stringify(result.result?.value, null, 2));
  fs.writeFileSync(OUT, JSON.stringify({ errors, result: result.result?.value }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
