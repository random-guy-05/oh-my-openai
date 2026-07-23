#!/usr/bin/env node
"use strict";
/**
 * Force-open threads via fiber onClick / link props, capture cdr-last-error.
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
const PORT = 9342;
const OUT = path.join(__dirname, "..", "out", "debug-fiber-click.json");
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
  for (let i = 0; i < 70; i++) {
    try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); if (targets?.length) break; } catch {}
    await sleep(400);
  }
  console.log("targets", targets.map((t) => t.url || t.title || t.type));
  const page = targets.find((t) => (t.url || "").includes("app://")) || targets[0];
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

  const result = await s.send("Runtime.evaluate", {
    expression: `(() => {
      localStorage.removeItem('cdr-last-error');
      const found = [];
      const q = [];
      const seen = new Set();
      for (const el of [document.body, document.documentElement, document.getElementById('root')]) {
        if (!el) continue;
        for (const k of Object.keys(el)) if (k.startsWith('__react')) q.push(el[k]);
      }
      let visited = 0;
      while (q.length && visited < 20000) {
        const f = q.shift();
        if (!f || seen.has(f)) continue;
        seen.add(f); visited++;
        try {
          const p = f.memoizedProps || {};
          const to = typeof p.to === 'string' ? p.to : (p.href || null);
          if (to && String(to).includes('/local/')) {
            found.push({kind:'link', to:String(to), hasClick: typeof p.onClick==='function'});
            if (typeof p.onClick === 'function') {
              try { p.onClick({preventDefault(){}, stopPropagation(){}, button:0}); } catch (e) { found.push({clickErr:String(e)}); }
            }
          }
          if (typeof p.onSelect === 'function' && (p.thread || p.conversation || p.item)) {
            found.push({kind:'onSelect', title: (p.thread&&p.thread.title)||(p.item&&p.item.title)||null, id:(p.thread&&p.thread.id)||(p.item&&p.item.id)||null});
          }
          if (typeof p.onClick === 'function' && (p.conversationId || p.threadId || (p.thread && p.thread.id))) {
            const id = p.conversationId || p.threadId || p.thread.id;
            found.push({kind:'rowClick', id});
          }
        } catch {}
        if (f.child) q.push(f.child);
        if (f.sibling) q.push(f.sibling);
      }
      // Dedup link targets and navigate via first few using history + click synthetic
      const links = [...new Set(found.filter(x=>x.to).map(x=>x.to))].slice(0, 8);
      return {visited, found: found.slice(0, 40), links, href: location.href, last: localStorage.getItem('cdr-last-error')};
    })()`,
    returnByValue: true,
  });
  console.log("scan", JSON.stringify(result.result?.value, null, 2).slice(0, 5000));

  const links = result.result?.value?.links || [];
  const navs = [];
  for (const to of links.slice(0, 5)) {
    console.log("OPEN", to);
    await s.send("Runtime.evaluate", {
      expression: `(() => {
        localStorage.removeItem('cdr-last-error');
        localStorage.setItem('cdr-product-mode','codex');
        try{CDRRuntime.setMode('codex')}catch{}
        const to = ${JSON.stringify(to)};
        // click matching anchor if any
        const a = document.querySelector('a[href=\"'+to+'\"]') || document.querySelector('a[href=\"'+to.replace(/^\\//,'')+'\"]');
        if (a) { a.click(); return 'a.click'; }
        // react-router Link often uses onClick without real href navigation in electron
        window.history.pushState({}, '', to);
        window.dispatchEvent(new PopStateEvent('popstate'));
        // fire click on any element whose fiber props.to matches
        let clicked = false;
        const q=[]; const seen=new Set();
        const sk=Object.keys(document.body).find(k=>k.startsWith('__react'));
        if(sk) q.push(document.body[sk]);
        let v=0;
        while(q.length && v<15000 && !clicked){
          const f=q.shift(); if(!f||seen.has(f)) continue; seen.add(f); v++;
          try{
            const p=f.memoizedProps||{};
            if(p.to===to && typeof p.onClick==='function'){
              p.onClick({preventDefault(){}, stopPropagation(){}, button:0, defaultPrevented:false});
              clicked=true; break;
            }
          }catch{}
          if(f.child) q.push(f.child); if(f.sibling) q.push(f.sibling);
        }
        return {clicked, href: location.href};
      })()`,
      returnByValue: true,
    });
    await sleep(4000);
    const snap = await s.send("Runtime.evaluate", {
      expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,700)})`,
      returnByValue: true,
    });
    console.log("snap", JSON.stringify(snap.result?.value).slice(0, 500));
    navs.push({ to, snap: snap.result?.value });
    if (snap.result?.value?.oops || snap.result?.value?.last) break;
  }

  // If no links, try invoking onSelect with first thread-like item from store via IPC bridge
  if (!links.length) {
    const fallback = await s.send("Runtime.evaluate", {
      expression: `(() => {
        localStorage.removeItem('cdr-last-error');
        // Try electronBridge / known hosts listRecent
        const out = {tried:[]};
        try {
          if (window.electronBridge) out.keys = Object.keys(window.electronBridge);
        } catch {}
        // Click first sidebar row by synthesizing pointer on elements with cursor:pointer in left 320px containing long text
        const nodes = [...document.querySelectorAll('div,button,a,span')];
        const rows = nodes.map(el => {
          const r = el.getBoundingClientRect();
          const t = (el.innerText||'').trim();
          return {el, r, t};
        }).filter(x => x.r.x < 360 && x.r.width > 80 && x.r.height > 24 && x.r.height < 90 && x.t.length > 10 && x.t.length < 80 && x.r.y > 140)
          .filter(x => !/New chat|Pull requests|Scheduled|Plugins|Projects|Settings|Chats|No chats/i.test(x.t));
        out.rowCount = rows.length;
        out.samples = rows.slice(0,8).map(x => ({t:x.t.slice(0,50), y:x.r.y, x:x.r.x}));
        if (rows[0]) {
          const el = rows[0].el;
          el.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
          out.clicked = rows[0].t.slice(0,60);
        }
        return out;
      })()`,
      returnByValue: true,
    });
    console.log("fallback", fallback.result?.value);
    await sleep(4000);
    const snap = await s.send("Runtime.evaluate", {
      expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,700)})`,
      returnByValue: true,
    });
    console.log("fallback snap", snap.result?.value);
    navs.push({ fallback: fallback.result?.value, snap: snap.result?.value });
  }

  fs.writeFileSync(OUT, JSON.stringify({ errors, scan: result.result?.value, navs }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
