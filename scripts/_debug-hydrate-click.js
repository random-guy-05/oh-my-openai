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
const PORT = 9343;
const OUT = path.join(__dirname, "..", "out", "debug-targets-hydrate.json");
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

  const timeline = [];
  let page = null;
  for (let i = 0; i < 40; i++) {
    let targets = [];
    try { targets = await getJSON(`http://127.0.0.1:${PORT}/json`); } catch {}
    const summary = targets.map((t) => ({ type: t.type, url: t.url, title: t.title }));
    timeline.push({ t: i * 2, targets: summary });
    console.log("t", i * 2, summary);
    page = targets.find((t) => (t.url || "").includes("app://")) || targets[0] || page;
    if (page && i >= 5) {
      // probe body
      try {
        const s = cdp(page.webSocketDebuggerUrl);
        await s.ready;
        await s.send("Runtime.enable");
        const snap = await s.send("Runtime.evaluate", {
          expression: `({href:location.href,title:document.title,body:(document.body&&document.body.innerText||'').slice(0,300),len:(document.body&&document.body.innerText||'').length,rootKids:document.getElementById('root')?document.getElementById('root').childElementCount: -1, last: localStorage.getItem('cdr-last-error')})`,
          returnByValue: true,
        });
        console.log("snap", snap.result?.value);
        timeline.push({ t: i * 2, snap: snap.result?.value });
        // if hydrated with chats, try click via text coordinates
        const body = snap.result?.value?.body || "";
        if (/Scoutly|OSA|Locate custom|Personal Website|Garcia/i.test(body)) {
          const click = await s.send("Runtime.evaluate", {
            expression: `(() => {
              localStorage.removeItem('cdr-last-error');
              localStorage.setItem('cdr-product-mode','codex');
              try{CDRRuntime.setMode('codex')}catch{}
              const want=['Scoutly','OSA Hypothesis','Locate custom','Personal Website','Garcia Lab','Disable Supabase'];
              function boxFor(substr){
                const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
                let n;
                while(n=w.nextNode()){
                  if(!(n.nodeValue||'').includes(substr)) continue;
                  let el=n.parentElement; let best=el;
                  for(let i=0;i<10&&el;i++){
                    const r=el.getBoundingClientRect();
                    if(r.width>50 && r.height>18 && r.height<100 && r.x<400) best=el;
                    el=el.parentElement;
                  }
                  const r=best.getBoundingClientRect();
                  return {text:(n.nodeValue||'').trim().slice(0,60), x:r.x+r.width/2, y:r.y+r.height/2, w:r.width,h:r.height};
                }
                return null;
              }
              for(const w of want){
                const b=boxFor(w.slice(0,10));
                if(b && b.x>0) return b;
              }
              return null;
            })()`,
            returnByValue: true,
          });
          console.log("box", click.result?.value);
          const box = click.result?.value;
          if (box && box.x > 0) {
            await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x: box.x, y: box.y, button: "left", clickCount: 1 });
            await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: box.x, y: box.y, button: "left", clickCount: 1 });
            await sleep(5000);
            const after = await s.send("Runtime.evaluate", {
              expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,900)})`,
              returnByValue: true,
            });
            console.log("AFTER CLICK", after.result?.value);
            timeline.push({ clicked: box, after: after.result?.value });
            fs.writeFileSync(OUT, JSON.stringify({ timeline, errors: [] }, null, 2));
            s.close();
            if (after.result?.value?.oops || after.result?.value?.last) {
              console.log("CAUGHT ERROR");
              return;
            }
          }
          s.close();
          break;
        }
        s.close();
      } catch (e) {
        console.log("probe err", e.message);
      }
    }
    await sleep(2000);
  }
  fs.writeFileSync(OUT, JSON.stringify({ timeline }, null, 2));
  console.log("wrote", OUT);
}
main().catch((e) => { console.error(e); process.exit(1); });
