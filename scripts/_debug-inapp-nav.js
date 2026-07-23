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
const PORT = 9338;
const OUT = path.join(__dirname, "..", "out", "debug-inapp-nav.json");
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
      const ex = d.exception?.description || d.text;
      errors.push(ex);
      console.log("EX", String(ex).slice(0, 1000));
    }
  });
  await sleep(5500);

  // Collect ids via fiber quickly
  const idsGot = await s.send("Runtime.evaluate", {
    expression: `(() => {
      window.__cdrE=[];
      window.addEventListener('error',e=>window.__cdrE.push({t:'err',m:String(e.message),s:String(e.error&&e.error.stack||'')}));
      window.addEventListener('unhandledrejection',e=>window.__cdrE.push({t:'rej',m:String(e.reason&&e.reason.message||e.reason),s:String(e.reason&&e.reason.stack||'')}));
      const ids=new Set(); const titles=[];
      function consider(obj, depth=0){
        if(!obj||depth>5) return;
        if(typeof obj==='string'){
          if(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(obj)) ids.add(obj);
          return;
        }
        if(typeof obj!=='object') return;
        if(Array.isArray(obj)){ for(const x of obj.slice(0,40)) consider(x,depth+1); return; }
        if(typeof obj.id==='string' && (obj.title||obj.cwd||obj.turns||obj.mode)) {
          ids.add(obj.id.replace(/^local:/,''));
          if(obj.title) titles.push({id:obj.id,title:String(obj.title).slice(0,60)});
        }
        if(obj.conversationId) ids.add(String(obj.conversationId).replace(/^local:/,''));
        if(obj.threadId) ids.add(String(obj.threadId).replace(/^local:/,''));
        for(const k of Object.keys(obj).slice(0,30)) if(/id|thread|conversation|recent/i.test(k)) consider(obj[k], depth+1);
      }
      const q=[]; const seen=new Set();
      const startKey=Object.keys(document.body).find(k=>k.startsWith('__react'));
      if(startKey) q.push(document.body[startKey]);
      let visited=0;
      while(q.length && visited<8000){
        const f=q.shift(); if(!f||seen.has(f)) continue; seen.add(f); visited++;
        try{ consider(f.memoizedProps,0); let s=f.memoizedState,n=0; while(s&&n<15){consider(s.memoizedState,1); s=s.next; n++;} }catch{}
        if(f.child) q.push(f.child); if(f.sibling) q.push(f.sibling);
      }
      return {ids:[...ids].slice(0,20), titles:titles.slice(0,15)};
    })()`,
    returnByValue: true,
  });
  console.log("ids", idsGot.result?.value);

  const ids = idsGot.result?.value?.ids || [];
  const results = [];

  async function openLocal(id, mode) {
    const r = await s.send("Runtime.evaluate", {
      expression: `(() => {
        try { localStorage.setItem('cdr-product-mode', ${JSON.stringify(mode)}); } catch {}
        try { CDRRuntime && CDRRuntime.setMode && CDRRuntime.setMode(${JSON.stringify(mode)}); } catch {}
        const path = '/local/' + ${JSON.stringify(id)};
        // Try multiple SPA navigation strategies
        try {
          const ev = new PopStateEvent('popstate');
          window.history.pushState({}, '', path);
          window.dispatchEvent(ev);
        } catch {}
        try {
          // react-router navigate via anchor click simulation
          let a = document.createElement('a');
          a.href = path;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
        } catch {}
        // Also try known navigate helpers
        try {
          if (window.__cdrNavigate) window.__cdrNavigate(path);
        } catch {}
        return {href: location.href, path};
      })()`,
      returnByValue: true,
    });
    await sleep(4000);
    const st = await s.send("Runtime.evaluate", {
      expression: `(() => {
        const text = document.body ? document.body.innerText : '';
        return {
          href: location.href,
          oops: /Oops, an error/i.test(text),
          body: text.slice(0, 800),
          errors: window.__cdrE || [],
        };
      })()`,
      returnByValue: true,
    });
    console.log(mode, id.slice(0, 8), JSON.stringify(st.result?.value).slice(0, 400));
    return { id, mode, nav: r.result?.value, state: st.result?.value };
  }

  for (const mode of ["codex", "chat", "work"]) {
    for (const id of ids.slice(0, 3)) {
      const row = await openLocal(id, mode);
      results.push(row);
      if (row.state?.oops || (row.state?.errors || []).length || errors.length) {
        fs.writeFileSync(OUT, JSON.stringify({ errors, results, idsGot: idsGot.result?.value }, null, 2));
        console.log("CAPTURED FAIL — wrote", OUT);
        s.close();
        return;
      }
    }
  }

  // Fallback: click first chat row using mouse on left sidebar after ensuring chat mode + scrolled list
  await s.send("Runtime.evaluate", {
    expression: `localStorage.setItem('cdr-product-mode','chat'); try{CDRRuntime.setMode('chat')}catch{};`,
  });
  await sleep(2000);
  // click at typical first thread position in sidebar
  for (const y of [180, 220, 260, 300, 340, 400, 460]) {
    await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 160, y, button: "left", clickCount: 1 });
    await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 160, y, button: "left", clickCount: 1 });
    await sleep(2500);
    const st = await s.send("Runtime.evaluate", {
      expression: `({href:location.href, oops:/Oops, an error/i.test(document.body.innerText||''), body:(document.body.innerText||'').slice(0,500), errors:window.__cdrE||[]})`,
      returnByValue: true,
    });
    console.log("clickY", y, st.result?.value);
    results.push({ clickY: y, state: st.result?.value });
    if (st.result?.value?.oops || (st.result?.value?.href || "").includes("/local/")) break;
  }

  fs.writeFileSync(OUT, JSON.stringify({ errors, results, idsGot: idsGot.result?.value }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

