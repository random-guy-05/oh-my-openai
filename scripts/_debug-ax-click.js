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
const PORT = 9341;
const OUT = path.join(__dirname, "..", "out", "debug-ax-click.json");
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
  await sleep(900);
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
  await s.send("Accessibility.enable");
  await s.send("DOM.enable");
  const errors = [];
  s.on((msg) => {
    if (msg.method === "Runtime.exceptionThrown") {
      const d = msg.params.exceptionDetails || {};
      errors.push(d.exception?.description || d.text);
      console.log("EX", String(d.exception?.description || d.text).slice(0, 800));
    }
  });
  await sleep(6500);

  await s.send("Runtime.evaluate", {
    expression: `localStorage.removeItem('cdr-last-error'); localStorage.setItem('cdr-product-mode','codex'); try{CDRRuntime.setMode('codex')}catch{}`,
  });
  await sleep(1500);

  const ax = await s.send("Accessibility.getFullAXTree");
  const nodes = ax.nodes || [];
  const interesting = nodes.filter((n) => {
    const name = n.name?.value || "";
    if (!name || name.length < 5 || name.length > 100) return false;
    if (/^(Chat|Codex|Work|New chat|Pull requests|Sites|Scheduled|Plugins|Projects|Settings|Custom|Chats)$/i.test(name)) return false;
    if (/To pick up a draggable|rate limit|Upgrade|No chats|No projects/i.test(name)) return false;
    return n.role?.value === "button" || n.role?.value === "link" || n.role?.value === "listitem" || n.role?.value === "StaticText" || n.role?.value === "generic";
  });
  console.log(
    "interesting",
    interesting.slice(0, 40).map((n) => ({
      role: n.role?.value,
      name: (n.name?.value || "").slice(0, 60),
      id: n.nodeId,
      backend: n.backendDOMNodeId,
    })),
  );

  const results = [];
  const candidates = interesting.filter((n) => n.backendDOMNodeId).slice(0, 12);
  for (const n of candidates) {
    try {
      const box = await s.send("DOM.getBoxModel", { backendNodeId: n.backendDOMNodeId });
      const c = box.model?.content;
      if (!c || c.length < 8) continue;
      const x = (c[0] + c[2]) / 2;
      const y = (c[1] + c[5]) / 2;
      console.log("click", n.name?.value?.slice(0, 50), x, y);
      await s.send("Runtime.evaluate", { expression: `localStorage.removeItem('cdr-last-error')` });
      await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(3500);
      const snap = await s.send("Runtime.evaluate", {
        expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),mode:localStorage.getItem('cdr-product-mode'),body:(document.body.innerText||'').slice(0,400)})`,
        returnByValue: true,
      });
      console.log("snap", JSON.stringify(snap.result?.value).slice(0, 350));
      results.push({ name: n.name?.value, snap: snap.result?.value });
      if (snap.result?.value?.oops || snap.result?.value?.last || (snap.result?.value?.title || "").startsWith("CDR ERR")) {
        fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
        console.log("CAUGHT", OUT);
        s.close();
        return;
      }
    } catch (e) {
      console.log("skip", e.message);
    }
  }

  // Also try Chat mode
  await s.send("Runtime.evaluate", {
    expression: `localStorage.setItem('cdr-product-mode','chat'); try{CDRRuntime.setMode('chat')}catch{};`,
  });
  await sleep(2000);
  const ax2 = await s.send("Accessibility.getFullAXTree");
  const nodes2 = (ax2.nodes || []).filter((n) => {
    const name = n.name?.value || "";
    return n.backendDOMNodeId && name.length > 8 && name.length < 90 && !/New chat|Pull request|Settings|draggable|Upgrade/i.test(name);
  });
  for (const n of nodes2.slice(0, 15)) {
    try {
      const box = await s.send("DOM.getBoxModel", { backendNodeId: n.backendDOMNodeId });
      const c = box.model?.content;
      if (!c) continue;
      const x = (c[0] + c[2]) / 2,
        y = (c[1] + c[5]) / 2;
      if (x > 420 || y < 120) continue; // sidebar-ish
      console.log("chat-click", n.name?.value?.slice(0, 50), x, y);
      await s.send("Runtime.evaluate", { expression: `localStorage.removeItem('cdr-last-error')` });
      await s.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
      await s.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
      await sleep(3500);
      const snap = await s.send("Runtime.evaluate", {
        expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,400)})`,
        returnByValue: true,
      });
      console.log("snap", JSON.stringify(snap.result?.value).slice(0, 350));
      results.push({ mode: "chat", name: n.name?.value, snap: snap.result?.value });
      if (snap.result?.value?.oops || snap.result?.value?.last || (snap.result?.value?.title || "").startsWith("CDR ERR") || (snap.result?.value?.href || "").includes("/local")) {
        await sleep(2000);
        const snap2 = await s.send("Runtime.evaluate", {
          expression: `({href:location.href,title:document.title,oops:/Oops, an error/i.test(document.body.innerText||''),last:localStorage.getItem('cdr-last-error'),body:(document.body.innerText||'').slice(0,800)})`,
          returnByValue: true,
        });
        results.push({ followup: snap2.result?.value });
        if (snap2.result?.value?.oops || snap2.result?.value?.last) {
          fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
          console.log("CAUGHT", OUT);
          s.close();
          return;
        }
      }
    } catch (e) {
      console.log("skip2", e.message);
    }
  }

  fs.writeFileSync(OUT, JSON.stringify({ errors, results }, null, 2));
  console.log("wrote", OUT);
  s.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
