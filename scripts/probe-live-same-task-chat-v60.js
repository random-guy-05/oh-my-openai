#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.CDR_PORT || 9366);
const out = path.join(__dirname, "..", "out", "probe-live-same-task-chat-v60.json");
const screenshotPath = path.join(__dirname, "..", "out", "probe-live-same-task-chat-v60.png");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function json(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on("error", reject);
  });
}

function connect(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const notifications = [];
  let id = 0;
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve);
    socket.addEventListener("error", (event) => reject(event.error || event));
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id) { notifications.push(message); return; }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  });
  return {
    ready,
    notifications,
    close: () => socket.close(),
    send: async (method, params = {}) => {
      await ready;
      const next = ++id;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(next);
          reject(new Error(`CDP timeout: ${method}`));
        }, 15000);
        pending.set(next, {
          resolve: (value) => { clearTimeout(timer); resolve(value); },
          reject: (error) => { clearTimeout(timer); reject(error); },
        });
        socket.send(JSON.stringify({ id: next, method, params }));
      });
    },
  };
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result?.value;
}

async function main() {
  let targets;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      targets = await json(`http://127.0.0.1:${port}/json`);
      if (targets?.length) break;
    } catch {}
    await sleep(500);
  }
  if (!targets?.length) throw new Error("No live Codex CDP target");
  const page = targets.find((target) => (target.url || "").startsWith("app://")) || targets[0];
  const client = connect(page.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await sleep(8000);

  const markers = await evaluate(client, `(async()=>{
    const url='./assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js';
    const source=await (await fetch(url)).text();
    return {v60:source.includes('same-task-chat-v60'),ensure:source.includes('sticky-chat-v45:ensure-client'),length:source.length,href:location.href};
  })()`, true);

  await evaluate(client, `(()=>{globalThis.__cdrV60Errors=[];addEventListener('error',e=>globalThis.__cdrV60Errors.push(String(e.error?.stack||e.message)));addEventListener('unhandledrejection',e=>globalThis.__cdrV60Errors.push(String(e.reason?.stack||e.reason)));return true})()`);
  const switchMode = async (label) => {
    const trigger = await evaluate(client, `(()=>{const el=[...document.querySelectorAll('button')].find(x=>(x.getAttribute('aria-label')||'').startsWith('Switch mode'));if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    if (!trigger) return false;
    const click = async (rect) => {
      await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, button: "left", clickCount: 1 });
      await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, button: "left", clickCount: 1 });
    };
    await click(trigger);
    await sleep(400);
    const item = await evaluate(client, `(()=>{const label=${JSON.stringify(label)};const el=[...document.querySelectorAll('[role="menuitem"],button')].find(x=>(x.innerText||'').trim().startsWith(label+'\\n')||(x.innerText||'').trim()===label);if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height}})()`);
    if (!item) return false;
    await click(item);
    await sleep(5000);
    return true;
  };

  await switchMode("Chat");
  const chat = await evaluate(client, `(()=>({
    href:location.href,
    mode:globalThis.__cdrLocalModeV4?.mode?.(),
    clientType:typeof globalThis.__cdrChatClient?.startCompletionStream,
    ensureType:typeof globalThis.__cdrEnsureChatClient,
    rows:(globalThis.__cdrChatPowerRows||[]).map(row=>({model:row.model,label:row.modelLabel,apiModel:row.apiModel,apiEffort:row.apiEffort})),
    selected:globalThis.__cdrChatSelectedModel,
    selects:[...document.querySelectorAll('select')].map(x=>x.getAttribute('aria-label')),
    errors:globalThis.__cdrV60Errors||[],
    body:(document.body.innerText||'').slice(-2500)
  }))()`);

  const modelTrigger = await evaluate(client, `(()=>{const labels=new Set((globalThis.__cdrChatPowerRows||[]).map(x=>x.modelLabel));const el=[...document.querySelectorAll('button')].find(x=>labels.has((x.innerText||'').trim())||(x.innerText||'').split('\\n').some(line=>labels.has(line.trim())));if(!el)return null;const r=el.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height,text:(el.innerText||'').trim(),aria:el.getAttribute('aria-label')}})()`);
  if (modelTrigger) {
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: modelTrigger.x + modelTrigger.width / 2, y: modelTrigger.y + modelTrigger.height / 2, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: modelTrigger.x + modelTrigger.width / 2, y: modelTrigger.y + modelTrigger.height / 2, button: "left", clickCount: 1 });
    await sleep(800);
  }
  const menu = await evaluate(client, `(()=>[...document.querySelectorAll('[role="menu"]')].map(x=>(x.innerText||'').trim()).filter(Boolean).slice(-3))()`);
  await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape" });
  await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape" });
  const codexSwitch = await switchMode("Codex");
  const codex = await evaluate(client, `(()=>({mode:globalThis.__cdrLocalModeV4?.mode?.(),errors:globalThis.__cdrV60Errors||[],body:(document.body.innerText||'').slice(-1200)}))()`);
  await switchMode("Chat");
  const restored = await evaluate(client, `(()=>({mode:globalThis.__cdrLocalModeV4?.mode?.(),selected:globalThis.__cdrChatSelectedModel,errors:globalThis.__cdrV60Errors||[]}))()`);
  let screenshotError = null;
  try {
    const screenshot = await client.send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(screenshotPath, Buffer.from(screenshot.data, "base64"));
  } catch (error) {
    screenshotError = String(error?.stack || error);
  }
  const report = { markers, chat, modelTrigger, menu, codexSwitch, codex, restored, screenshotPath, screenshotError };
  fs.writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  client.close();
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
