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
const PORT = 9340;
const OUT = path.join(__dirname, "..", "out", "debug-catch-oops.json");
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
  let targets;
  for (let i = 0; i < 70; i++) {
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
      console.log("EX", String(d.exception?.description || d.text).slice(0, 800));
    }
  });
  await sleep(6000);

  async function snapshot(tag) {
    const r = await s.send("Runtime.evaluate", {
      expression: `(() => ({
        tag: ${JSON.stringify(tag)},
        href: location.href,
        title: document.title,
        oops: /Oops, an error/i.test(document.body&&document.body.innerText||''),
        last: localStorage.getItem('cdr-last-error'),
        mode: localStorage.getItem('cdr-product-mode'),
        body: (document.body&&document.body.innerText||'').slice(0,500),
      }))()`,
      returnByValue: true,
    });
    console.log("SNAP", tag, JSON.stringify(r.result?.value).slice(0, 500));
    return r.result?.value;
  }

  await snapshot("boot");

  // Get thread ids + try in-app router navigate by finding useNavigate dispatcher
  const prep = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const ids=new Set();
      const q=[]; const seen=new Set();
      const sk=Object.keys(document.body).find(k=>k.startsWith('__react'));
      if(sk) q.push(document.body[sk]);
      let v=0; let navigateFns=0;
      while(q.length && v<10000){
        const f=q.shift(); if(!f||seen.has(f)) continue; seen.add(f); v++;
        try {
          const p=f.memoizedProps||{};
          if(typeof p.conversationId==='string') ids.add(p.conversationId.replace(/^local:/,''));
          if(typeof p.threadId==='string') ids.add(p.threadId.replace(/^local:/,''));
          if(p.conversation && typeof p.conversation.id==='string') ids.add(p.conversation.id.replace(/^local:/,''));
          if(typeof p.to==='string' && p.to.includes('/local/')) {
            const m=p.to.match(/\\/local\\/([^/?#]+)/); if(m) ids.add(m[1]);
          }
          // capture navigate
          if(typeof p.navigate==='function') { window.__cdrNav=p.navigate; navigateFns++; }
        } catch {}
        let st=f.memoizedState, n=0;
        while(st && n<25){
          try {
            const val=st.memoizedState;
            if(typeof val==='function' && val.name==='' && String(val).includes('NEXT_LOCATION')) {
              window.__cdrNav=val; navigateFns++;
            }
            if(val && typeof val==='object'){
              if(typeof val.id==='string' && (val.title||val.cwd)) ids.add(val.id.replace(/^local:/,''));
              if(Array.isArray(val)) {
                for(const item of val.slice(0,30)){
                  if(item && typeof item.id==='string') ids.add(String(item.id).replace(/^local:/,''));
                }
              }
            }
          } catch {}
          st=st.next; n++;
        }
        if(f.child) q.push(f.child); if(f.sibling) q.push(f.sibling);
      }
      return {ids:[...ids].slice(0,20), navigateFns, hasNav: typeof window.__cdrNav==='function'};
    })()`,
    returnByValue: true,
  });
  console.log("prep", prep.result?.value);
  const ids = prep.result?.value?.ids || [];

  const results = [];
  for (const mode of ["codex", "chat"]) {
    await s.send("Runtime.evaluate", {
      expression: `localStorage.setItem('cdr-product-mode',${JSON.stringify(mode)}); try{CDRRuntime.setMode(${JSON.stringify(mode)})}catch{}; localStorage.removeItem('cdr-last-error');`,
    });
    await sleep(1000);
    for (const id of ids.slice(0, 4)) {
      console.log("nav", mode, id);
      await s.send("Runtime.evaluate", {
        expression: `(() => {
          localStorage.removeItem('cdr-last-error');
          const path='/local/'+${JSON.stringify(id)};
          try {
            if(typeof window.__cdrNav==='function'){ window.__cdrNav(path); return 'navfn'; }
          } catch(e){ return 'navfn-err '+e; }
          try {
            window.history.pushState({},'',path);
            window.dispatchEvent(new PopStateEvent('popstate'));
            return 'history';
          } catch(e){ return 'hist-err '+e; }
        })()`,
        returnByValue: true,
      });
      await sleep(3500);
      const snap = await snapshot(mode + ":" + id.slice(0, 8));
      results.push(snap);
      if (snap?.oops || snap?.last || (snap?.title || "").startsWith("CDR ERR")) {
        fs.writeFileSync(OUT, JSON.stringify({ errors, prep: prep.result?.value, results }, null, 2));
        console.log("CAUGHT", OUT);
        s.close();
        return;
      }
    }
  }

  // brute force sidebar clicks
  for (const mode of ["chat", "codex"]) {
    await s.send("Runtime.evaluate", {
      expression: `localStorage.setItem('cdr-product-mode',${JSON.stringify(mode)}); try{CDRRuntime.setMode(${JSON.stringify(mode)})}catch{}; localStorage.removeItem('cdr-last-error');`,
    });
    await sleep(1500);
    for (let y = 160; y <= 520; y += 28) {
      await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: 150, y, button: "left", clickCount: 1 });
      await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 150, y, button: "left", clickCount: 1 });
      await sleep(1200);
      const snap = await snapshot(`click-${mode}-${y}`);
      results.push(snap);
      if (snap?.oops || snap?.last || (snap?.href || "").includes("/local/") || (snap?.title || "").startsWith("CDR ERR")) {
        // keep going a bit if navigated, wait for possible crash
        await sleep(2500);
        const snap2 = await snapshot(`after-${mode}-${y}`);
        results.push(snap2);
        if (snap2?.oops || snap2?.last || (snap2?.title || "").startsWith("CDR ERR")) {
          fs.writeFileSync(OUT, JSON.stringify({ errors, prep: prep.result?.value, results }, null, 2));
          console.log("CAUGHT via click", OUT);
          s.close();
          return;
        }
      }
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({ errors, prep: prep.result?.value, results }, null, 2));
  console.log("wrote", OUT, "no oops captured");
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
