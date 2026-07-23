#!/usr/bin/env node
"use strict";
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const APP = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
);
const PORT = 9334;
const OUT = path.join(__dirname, "..", "out", "debug-cdp-repro2.json");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => resolve(JSON.parse(d)));
      })
      .on("error", reject);
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
  try {
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", { stdio: "ignore" });
  } catch {}
  await sleep(800);
  spawn(APP, [`--remote-debugging-port=${PORT}`], {
    detached: true,
    stdio: "ignore",
  }).unref();

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
  await s.send("DOM.enable");
  const errors = [];
  s.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails || {};
      const e = {
        text: d.text,
        exception: d.exception?.description || d.exception?.value,
        line: d.lineNumber,
      };
      errors.push(e);
      console.log("EX", String(e.exception || e.text).slice(0, 500));
    }
  });

  await sleep(5000);

  // Hook errors + set mode codex
  await s.send("Runtime.evaluate", {
    expression: `(() => {
      window.__cdrE=[];
      window.addEventListener('error',e=>window.__cdrE.push({t:'err',m:String(e.message),s:String(e.error&&e.error.stack||'')}));
      window.addEventListener('unhandledrejection',e=>window.__cdrE.push({t:'rej',m:String(e.reason&&e.reason.message||e.reason),s:String(e.reason&&e.reason.stack||'')}));
      localStorage.setItem('cdr-product-mode','codex');
      try{CDRRuntime&&CDRRuntime.setMode&&CDRRuntime.setMode('codex')}catch{}
      // click Codex mode pill
      for (const el of document.querySelectorAll('*')) {
        if ((el.childNodes.length<=2) && (el.textContent||'').trim()==='Codex') { el.click(); break; }
      }
      return location.href;
    })()`,
  });
  await sleep(2000);

  // Find element containing Scoutly and get box model, click center via Input
  const find = await s.send("Runtime.evaluate", {
    expression: `(() => {
      function findText(str) {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while (n = w.nextNode()) {
          if ((n.nodeValue||'').includes(str)) {
            let el = n.parentElement;
            // climb to clickable
            for (let i=0;i<8 && el;i++) {
              if (el.onclick || el.getAttribute('role') === 'button' || el.tagName==='BUTTON' || el.tagName==='A' || getComputedStyle(el).cursor==='pointer') break;
              el = el.parentElement;
            }
            const r = (el||n.parentElement).getBoundingClientRect();
            return {text: (n.nodeValue||'').trim().slice(0,80), x: r.x+r.width/2, y: r.y+r.height/2, w:r.width, h:r.height, tag:(el||n.parentElement).tagName, cls:String((el||n.parentElement).className).slice(0,100)};
          }
        }
        return null;
      }
      return JSON.stringify({
        scoutly: findText('Scoutly'),
        osa: findText('OSA Hypothesis'),
        personal: findText('Personal Website'),
        href: location.href,
        mode: localStorage.getItem('cdr-product-mode'),
      });
    })()`,
    returnByValue: true,
  });
  console.log("find", find.result?.value);
  let box = null;
  try {
    const j = JSON.parse(find.result.value);
    box = j.scoutly || j.osa || j.personal;
  } catch {}

  if (box && box.x > 0) {
    console.log("clicking", box);
    await s.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
    await s.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: box.x,
      y: box.y,
      button: "left",
      clickCount: 1,
    });
    await sleep(5000);
  } else {
    console.log("no box, trying DOM click climb");
    await s.send("Runtime.evaluate", {
      expression: `(() => {
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        let n;
        while (n = w.nextNode()) {
          if ((n.nodeValue||'').includes('Scoutly') || (n.nodeValue||'').includes('OSA Hypothesis')) {
            let el = n.parentElement;
            for (let i=0;i<10 && el;i++) {
              el.click();
              el = el.parentElement;
            }
            return 'clicked ancestors';
          }
        }
        return 'miss';
      })()`,
    });
    await sleep(5000);
  }

  const end = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const text = document.body.innerText || '';
      return JSON.stringify({
        href: location.href,
        oops: /Oops, an error/i.test(text),
        body: text.slice(0, 1200),
        errors: window.__cdrE || [],
      });
    })()`,
    returnByValue: true,
  });
  console.log("end", end.result?.value);
  fs.writeFileSync(OUT, JSON.stringify({ errors, find: find.result?.value, end: end.result?.value }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
