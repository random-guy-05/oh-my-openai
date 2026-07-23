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
const PORT = 9344;
const OUT = path.join(__dirname, "..", "out", "debug-open-thread.json");
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

async function waitPage() {
  for (let i = 0; i < 60; i++) {
    try {
      const targets = await getJSON(`http://127.0.0.1:${PORT}/json`);
      const page = targets.find((t) => (t.url || "").includes("app://"));
      if (page) return page;
    } catch {}
    await sleep(500);
  }
  throw new Error("no page");
}

async function evalSnap(s, tag) {
  const r = await s.send("Runtime.evaluate", {
    expression: `({tag:${JSON.stringify(tag)},href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,1000)})`,
    returnByValue: true,
  });
  console.log("SNAP", tag, JSON.stringify(r.result?.value).slice(0, 500));
  return r.result?.value;
}

async function clickText(s, substr) {
  const box = await s.send("Runtime.evaluate", {
    expression: `(() => {
      const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let n;
      while(n=w.nextNode()){
        if(!(n.nodeValue||'').includes(${JSON.stringify(substr)})) continue;
        let el=n.parentElement, best=el;
        for(let i=0;i<12&&el;i++){
          const r=el.getBoundingClientRect();
          if(r.width>40 && r.height>16 && r.height<110 && r.x<420) best=el;
          el=el.parentElement;
        }
        const r=best.getBoundingClientRect();
        if(r.width>0 && r.height>0) return {text:(n.nodeValue||'').trim().slice(0,80),x:r.x+r.width/2,y:r.y+r.height/2,w:r.width,h:r.height};
      }
      return null;
    })()`,
    returnByValue: true,
  });
  const b = box.result?.value;
  console.log("BOX", substr, b);
  if (!b) return false;
  await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: b.x, y: b.y, button: "left", clickCount: 1 });
  await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", clickCount: 1 });
  return true;
}

async function main() {
  try { execSync("pkill -f 'CodexDesktop-Rebuild/Codex.app' || true", { stdio: "ignore" }); } catch {}
  await sleep(1000);
  spawn(APP, [`--remote-debugging-port=${PORT}`], { detached: true, stdio: "ignore" }).unref();
  const page = await waitPage();
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

  // wait hydrate
  for (let i = 0; i < 30; i++) {
    const snap = await evalSnap(s, "wait" + i);
    if ((snap.body || "").includes("Scoutly")) break;
    await sleep(2000);
  }

  await s.send("Runtime.evaluate", {
    expression: `localStorage.removeItem('cdr-last-error'); localStorage.setItem('cdr-product-mode','codex'); try{CDRRuntime.setMode('codex')}catch{}`,
  });

  // Expand Scoutly project then click a thread
  await clickText(s, "Scoutly");
  await sleep(2000);
  await evalSnap(s, "after-scoutly");

  const threadTitles = [
    "Disable Supabase temporarily",
    "Draft ScoutingIQ",
    "Update main logo",
    "Lets generate some figures",
    "Refine OSA manuscript",
    "Summarize latest run results",
  ];
  const results = [];
  for (const title of threadTitles) {
    await s.send("Runtime.evaluate", { expression: `localStorage.removeItem('cdr-last-error')` });
    const ok = await clickText(s, title.slice(0, 18));
    if (!ok) continue;
    await sleep(4500);
    const snap = await evalSnap(s, "thread:" + title.slice(0, 20));
    results.push(snap);
    if (snap.oops || snap.last || (snap.title || "").startsWith("CDR ERR") || (snap.href || "").includes("/local")) {
      // wait a bit more if navigated
      await sleep(3000);
      const snap2 = await evalSnap(s, "follow:" + title.slice(0, 20));
      results.push(snap2);
      if (snap2.oops || snap2.last || (snap2.title || "").startsWith("CDR ERR")) {
        fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
        console.log("CAUGHT", OUT);
        s.close();
        return;
      }
    }
  }

  // Also try Chat mode open of a chat under Chats section
  await s.send("Runtime.evaluate", {
    expression: `localStorage.setItem('cdr-product-mode','chat'); try{CDRRuntime.setMode('chat')}catch{}; localStorage.removeItem('cdr-last-error');`,
  });
  await sleep(2000);
  await clickText(s, "Chat");
  await sleep(1500);
  for (const title of ["Locate custom Codex", "Reverse engineer", "hi", "Arnav Mana"]) {
    await s.send("Runtime.evaluate", { expression: `localStorage.removeItem('cdr-last-error')` });
    if (!(await clickText(s, title.slice(0, 12)))) continue;
    await sleep(4500);
    const snap = await evalSnap(s, "chat:" + title);
    results.push(snap);
    if (snap.oops || snap.last || (snap.title || "").startsWith("CDR ERR")) {
      fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
      console.log("CAUGHT", OUT);
      s.close();
      return;
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
