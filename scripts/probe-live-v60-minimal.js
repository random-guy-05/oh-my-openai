#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.CDR_PORT || 9366);
const output = path.join(__dirname, "..", "out", "probe-live-v60-minimal.json");
const trace = [];
const record = (step, data = null) => {
  trace.push({ step, at: Date.now(), data });
  fs.writeFileSync(output + ".trace", JSON.stringify(trace, null, 2));
};

const watchdog = setTimeout(() => {
  record("watchdog-timeout");
  process.exit(2);
}, 45000);

function getJson(url) {
  return new Promise((resolve, reject) => {
    const request = http.get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => (body += chunk));
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.setTimeout(5000, () => request.destroy(new Error("HTTP timeout")));
    request.on("error", reject);
  });
}

async function main() {
  record("start", { port });
  const targets = await getJson(`http://127.0.0.1:${port}/json`);
  record("targets", targets.map((target) => ({ type: target.type, url: target.url })));
  const page = targets.find((target) => (target.url || "").startsWith("app://")) || targets.find((target) => target.type === "page");
  if (!page) throw new Error("No app page target");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  const opened = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 5000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", (event) => { clearTimeout(timer); reject(event.error || new Error("WebSocket error")); }, { once: true });
  });
  await opened;
  record("socket-open");
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 8000);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable");
  const expression = `(async()=>{const url='./assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js';const source=await(await fetch(url,{cache:'no-store'})).text();const catalog=globalThis.__cdrChatCatalog||{};const clean=option=>({slug:option?.slug,title:option?.title,selectedLabel:option?.selectedLabel,modelLabel:option?.modelLabel,thinkingEffort:option?.thinkingEffort,lane:option?.lane,hidden:option?.hidden});return{href:location.href,title:document.title,assetLength:source.length,v60:source.includes('same-task-chat-v60'),ensureMarker:source.includes('sticky-chat-v45:ensure-client'),mode:globalThis.__cdrLocalModeV4?.mode?.(),ensureType:typeof globalThis.__cdrEnsureChatClient,clientType:typeof globalThis.__cdrChatClient?.startCompletionStream,rowCount:(globalThis.__cdrChatPowerRows||[]).length,rows:(globalThis.__cdrChatPowerRows||[]).map(row=>({label:row.modelLabel,apiModel:row.apiModel,apiEffort:row.apiEffort})),catalog:{defaultModelSlug:catalog.defaultModelSlug,options:(catalog.options||[]).map(clean),versions:(catalog.versionOptions||[]).map(version=>({id:version.id,label:version.label,title:version.title,options:(version.options||[]).map(clean)}))},selectCount:document.querySelectorAll('select').length,body:(document.body.innerText||'').slice(-1500)}})()`;
  const evaluated = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
  const report = { page: { url: page.url, title: page.title }, runtime: evaluated.result?.value, trace };
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  record("complete");
  clearTimeout(watchdog);
  socket.close();
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main().catch((error) => {
  record("error", String(error?.stack || error));
  clearTimeout(watchdog);
  console.error(error.stack || error);
  process.exit(1);
});
