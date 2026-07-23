#!/usr/bin/env node
"use strict";
/**
 * Reproduce "Oops, an error has occurred" when opening a thread.
 * Uses CDP against live Codex rebuild binary.
 */
const { spawn, execSync } = require("child_process");
const http = require("http");
const os = require("os");
const fs = require("fs");
const path = require("path");

const APP = (() => {
  const candidates = [
    path.join(
      os.homedir(),
      "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT",
    ),
    "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/MacOS/ChatGPT",
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  throw new Error("binary missing");
})();
const PORT = 9333;
const OUT = path.join(__dirname, "..", "out", "debug-cdp-repro.json");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
function getJSON(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let d = "";
        res.on("data", (c) => (d += c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(d));
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

function cdpSession(wsUrl) {
  if (typeof WebSocket === "undefined") throw new Error("no WebSocket");
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  let ws;
  const ready = new Promise((resolve, reject) => {
    ws = new WebSocket(wsUrl);
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(e.error || e));
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && pending.has(msg.id)) {
        const { resolve, reject } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) reject(new Error(JSON.stringify(msg.error)));
        else resolve(msg.result);
      }
      for (const fn of listeners) fn(msg);
    });
  });
  return {
    ready,
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async send(method, params = {}) {
      await ready;
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      try {
        ws.close();
      } catch {}
    },
  };
}

async function main() {
  try {
    execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", {
      stdio: "ignore",
    });
  } catch {}
  await sleep(1000);

  const child = spawn(APP, [`--remote-debugging-port=${PORT}`], {
    env: { ...process.env, ELECTRON_ENABLE_LOGGING: "1" },
    stdio: "ignore",
    detached: true,
  });
  child.unref();

  let targets = null;
  for (let i = 0; i < 60; i++) {
    try {
      targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
      if (targets?.length) break;
    } catch {}
    await sleep(400);
  }
  if (!targets?.length) throw new Error("no targets");
  const page =
    targets.find((t) => (t.url || "").includes("app://")) || targets[0];
  console.log("page", page.url);
  const s = cdpSession(page.webSocketDebuggerUrl);
  await s.ready;
  await s.send("Runtime.enable");
  await s.send("Page.enable");

  const errors = [];
  s.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params?.exceptionDetails || {};
      errors.push({
        text: d.text,
        exception: d.exception?.description || d.exception?.value,
        url: d.url,
        line: d.lineNumber,
        stack: d.stackTrace,
      });
      console.log("EXCEPTION", (d.exception?.description || d.text || "").slice(0, 400));
    }
  });

  await sleep(4000);

  // Install error hooks + inspect DOM
  const probe1 = await s.send("Runtime.evaluate", {
    expression: `(() => {
      window.__cdrDebugErrors = window.__cdrDebugErrors || [];
      if (!window.__cdrDebugHooked) {
        window.__cdrDebugHooked = true;
        window.addEventListener('error', e => {
          window.__cdrDebugErrors.push({type:'error', msg:String(e.message||e.error), stack:String(e.error&&e.error.stack||''), at:Date.now()});
        });
        window.addEventListener('unhandledrejection', e => {
          window.__cdrDebugErrors.push({type:'rejection', msg:String(e.reason&&e.reason.message||e.reason), stack:String(e.reason&&e.reason.stack||''), at:Date.now()});
        });
        const orig = console.error;
        console.error = function() {
          try { window.__cdrDebugErrors.push({type:'console.error', msg:[...arguments].map(String).join(' '), at:Date.now()}); } catch {}
          return orig.apply(this, arguments);
        };
      }
      const text = (document.body && document.body.innerText || '').slice(0, 1500);
      const oops = text.includes('Oops');
      // Collect clickable sidebar rows
      const candidates = [];
      for (const el of document.querySelectorAll('button, a, [role="button"], [role="link"], div, span')) {
        const t = (el.innerText || el.textContent || '').trim();
        if (!t || t.length < 4 || t.length > 80) continue;
        if (/^(Chat|Codex|Work|New chat|Pull requests|Sites|Scheduled|Plugins|Projects)$/i.test(t)) continue;
        // likely thread titles from previous probe
        if (el.closest && el.closest('[class*="sidebar"], nav, aside')) {
          candidates.push({tag: el.tagName, text: t.slice(0,80), cls: String(el.className).slice(0,80)});
        }
      }
      // Also broader: any element with thread-like text
      const allClick = [];
      for (const el of document.querySelectorAll('button, a, [role="button"]')) {
        const t = (el.innerText || '').trim();
        if (t && t.length > 8 && t.length < 100 && !/new chat|settings|plugins/i.test(t)) {
          allClick.push(t.slice(0, 80));
        }
      }
      return JSON.stringify({
        mode: localStorage.getItem('cdr-product-mode'),
        href: location.href,
        oops,
        text: text.slice(0, 400),
        candidates: candidates.slice(0, 20),
        allClick: [...new Set(allClick)].slice(0, 30),
        errors: window.__cdrDebugErrors.slice(-10),
      });
    })()`,
    returnByValue: true,
  });
  console.log("probe1", probe1.result?.value);

  // Switch to Codex mode via localStorage + UI if possible
  await s.send("Runtime.evaluate", {
    expression: `(() => {
      try {
        localStorage.setItem('cdr-product-mode', 'codex');
        document.documentElement.setAttribute('data-codex-product-mode', 'codex');
        if (globalThis.CDRRuntime && typeof CDRRuntime.setMode === 'function') CDRRuntime.setMode('codex');
        // click mode control labeled Codex
        for (const el of document.querySelectorAll('button, [role="button"], [role="radio"], div, span')) {
          const t = (el.innerText || '').trim();
          if (t === 'Codex' || t === 'Agent') { el.click(); break; }
        }
      } catch (e) { return String(e); }
      return 'ok';
    })()`,
    returnByValue: true,
  });
  await sleep(1500);

  // Click first plausible thread item
  const clickRes = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const prefer = ['Scoutly', 'Personal Website', 'OSA', 'Draft', 'Polish', 'Refine', 'Update main'];
      const buttons = [...document.querySelectorAll('button, a, [role="button"], [role="link"]')];
      let hit = null;
      for (const p of prefer) {
        hit = buttons.find(b => (b.innerText || '').includes(p));
        if (hit) break;
      }
      if (!hit) {
        // fallback: longest non-nav button text in left half
        hit = buttons
          .map(b => ({b, t: (b.innerText || '').trim()}))
          .filter(x => x.t.length > 12 && x.t.length < 90)
          .filter(x => !/new chat|pull request|scheduled|plugins|projects|settings/i.test(x.t))
          .sort((a,b) => b.t.length - a.t.length)[0]?.b;
      }
      if (!hit) return JSON.stringify({ok:false, reason:'no thread control'});
      const label = (hit.innerText || '').trim().slice(0, 100);
      hit.click();
      return JSON.stringify({ok:true, label, href: location.href});
    })()`,
    returnByValue: true,
  });
  console.log("click", clickRes.result?.value);
  await sleep(4000);

  const probe2 = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const text = (document.body && document.body.innerText || '');
      const oopsIdx = text.indexOf('Oops');
      return JSON.stringify({
        mode: localStorage.getItem('cdr-product-mode'),
        href: location.href,
        oops: oopsIdx >= 0,
        oopsContext: oopsIdx >= 0 ? text.slice(Math.max(0, oopsIdx - 80), oopsIdx + 200) : null,
        bodyHead: text.slice(0, 600),
        errors: window.__cdrDebugErrors || [],
        reactFiberErrors: [...document.querySelectorAll('*')].filter(e => /oops|error has occurred/i.test(e.textContent||'')).slice(0,3).map(e => (e.innerText||'').slice(0,200)),
      });
    })()`,
    returnByValue: true,
  });
  console.log("probe2", probe2.result?.value);

  // If still on home, try navigating by guessing local ids from recent route history / atoms — dump location and try /local/ from performance entries
  const nav = await s.send("Runtime.evaluate", {
    expression: `(() => {
      // Try to find conversation ids in memory / DOM data attrs
      const ids = new Set();
      for (const el of document.querySelectorAll('[data-thread-id], [data-conversation-id], [href*=\"/local/\"]')) {
        const href = el.getAttribute('href') || '';
        const m = href.match(/\\/local\\/([^/?#]+)/);
        if (m) ids.add(m[1]);
        const d = el.getAttribute('data-thread-id') || el.getAttribute('data-conversation-id');
        if (d) ids.add(d);
      }
      // scan scripts / html for uuid-looking local ids near 'local:'
      const html = document.documentElement.innerHTML;
      for (const m of html.matchAll(/local[:/]([0-9a-fA-F-]{36})/g)) ids.add(m[1]);
      for (const m of html.matchAll(/\\/local\\/([0-9a-fA-F-]{36})/g)) ids.add(m[1]);
      // localStorage thread map
      try {
        const map = JSON.parse(localStorage.getItem('cdr-thread-map') || '{}');
        for (const k of Object.keys(map.byLocal || {})) {
          const m = k.match(/local:(.+)/);
          if (m) ids.add(m[1]);
        }
      } catch {}
      return JSON.stringify([...ids].slice(0, 20));
    })()`,
    returnByValue: true,
  });
  console.log("ids", nav.result?.value);

  let ids = [];
  try {
    ids = JSON.parse(nav.result?.value || "[]");
  } catch {}

  if (ids[0]) {
    const url = `/local/${ids[0]}`;
    console.log("navigate", url);
    await s.send("Runtime.evaluate", {
      expression: `window.location.hash = ''; window.history.pushState({}, '', ${JSON.stringify(url)}); window.dispatchEvent(new PopStateEvent('popstate')); location.href = ${JSON.stringify("app://-" + url)};`,
      returnByValue: true,
    });
    await sleep(5000);
  } else {
    // click again with mouse via DOM coordinates on first sidebar row text match
    await s.send("Runtime.evaluate", {
      expression: `(() => {
        const titles = ['Scoutly','Personal Website','OSA Hypothesis','Draft ScoutingIQ','Polish personal','Update main logo'];
        for (const title of titles) {
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
          let n;
          while (n = walker.nextNode()) {
            const t = (n.childNodes.length === 1 && n.childNodes[0].nodeType === 3) ? (n.textContent||'').trim() : '';
            if (t && t.includes(title.slice(0, 12))) {
              n.click();
              return 'clicked ' + t.slice(0,60);
            }
          }
        }
        return 'no text node click';
      })()`,
      returnByValue: true,
    });
    await sleep(4000);
  }

  const probe3 = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const text = (document.body && document.body.innerText || '');
      return JSON.stringify({
        href: location.href,
        oops: /Oops, an error/i.test(text),
        bodyHead: text.slice(0, 800),
        errors: window.__cdrDebugErrors || [],
      });
    })()`,
    returnByValue: true,
  });
  console.log("probe3", probe3.result?.value);

  const result = {
    errors,
    probe1: probe1.result?.value,
    click: clickRes.result?.value,
    probe2: probe2.result?.value,
    ids: nav.result?.value,
    probe3: probe3.result?.value,
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log("wrote", OUT);
  s.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
