#!/usr/bin/env node
"use strict";
/**
 * Launch app, set chat mode, navigate to /local/hi-thread if found, simulate
 * send via bridge, capture cdr-last-error + exceptions.
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
const PORT = 9350;
const OUT = path.join(__dirname, "..", "out", "debug-chat-send-oops.json");
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
  try {
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", { stdio: "ignore" });
  } catch {}
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
      errors.push({
        text: d.text,
        exception: d.exception?.description || d.exception?.value,
      });
      console.log("EX", String(d.exception?.description || d.text).slice(0, 1200));
    }
  });
  await sleep(8000);

  // Read existing last error + force chat + open a local thread from sidebar fiber/ids
  const prep = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const last = localStorage.getItem('cdr-last-error');
      localStorage.setItem('cdr-product-mode','chat');
      try { CDRRuntime.setMode('chat'); } catch {}
      // Find any /local/ ids from previous session in html or storage
      const ids = [];
      try {
        for (const k of Object.keys(localStorage)) {
          if (k.startsWith('cdr-thread-extras:local:')) ids.push(k.replace('cdr-thread-extras:local:',''));
        }
      } catch {}
      return { last, ids, href: location.href, body: (document.body.innerText||'').slice(0,400), oops: /Oops, an error/i.test(document.body.innerText||'') };
    })()`,
    returnByValue: true,
  });
  console.log("prep", prep.result?.value);

  // Click "hi" chat if present
  await s.send("Runtime.evaluate", {
    expression: `(() => {
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while (n = w.nextNode()) {
        if ((n.nodeValue || '').trim() === 'hi') {
          let el = n.parentElement;
          for (let i = 0; i < 10 && el; i++) {
            const r = el.getBoundingClientRect();
            if (r.width > 40 && r.height > 16 && r.x < 400) {
              el.click();
              return { clicked: true, y: r.y };
            }
            el = el.parentElement;
          }
        }
      }
      return { clicked: false };
    })()`,
    returnByValue: true,
  });
  await sleep(3000);

  // Try to type and send in composer
  const sendAttempt = await s.send("Runtime.evaluate", {
    expression: `(() => {
      localStorage.removeItem('cdr-last-error');
      // Find contenteditable / textarea composer
      const editors = [
        ...document.querySelectorAll('[contenteditable=\"true\"], textarea, [role=\"textbox\"]'),
      ];
      const ed = editors.find(e => {
        const r = e.getBoundingClientRect();
        return r.width > 100 && r.y > 200;
      }) || editors[0];
      if (!ed) return { ok:false, reason:'no editor', editors: editors.length };
      ed.focus();
      if (ed.isContentEditable) {
        ed.textContent = 'debug probe ' + Date.now();
        ed.dispatchEvent(new InputEvent('input', { bubbles: true }));
      } else {
        ed.value = 'debug probe ' + Date.now();
        ed.dispatchEvent(new Event('input', { bubbles: true }));
      }
      // Find send button
      const btns = [...document.querySelectorAll('button')];
      const send = btns.find(b => /send/i.test(b.getAttribute('aria-label')||'') || /send/i.test(b.getAttribute('data-testid')||'') || b.querySelector('svg') && (b.getBoundingClientRect().y > window.innerHeight - 200));
      // Prefer button near bottom right
      const bottom = btns
        .map(b => ({b, r: b.getBoundingClientRect()}))
        .filter(x => x.r.y > window.innerHeight - 180 && x.r.x > window.innerWidth - 200 && x.r.width > 20)
        .sort((a,c) => c.r.x - a.r.x)[0];
      if (bottom) { bottom.b.click(); return { ok:true, via:'bottom-btn', href: location.href }; }
      // Enter key
      ed.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }));
      return { ok:true, via:'enter', href: location.href, editorTag: ed.tagName };
    })()`,
    returnByValue: true,
  });
  console.log("sendAttempt", sendAttempt.result?.value);
  await sleep(6000);

  const after = await s.send("Runtime.evaluate", {
    expression: `({
      href: location.href,
      title: document.title,
      oops: /Oops, an error/i.test(document.body.innerText||''),
      updateBtn: /Update ChatGPT/i.test(document.body.innerText||''),
      last: localStorage.getItem('cdr-last-error'),
      body: (document.body.innerText||'').slice(0, 900),
    })`,
    returnByValue: true,
  });
  console.log("after", after.result?.value);
  fs.writeFileSync(
    OUT,
    JSON.stringify(
      { errors, prep: prep.result?.value, sendAttempt: sendAttempt.result?.value, after: after.result?.value },
      null,
      2,
    ),
  );
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
