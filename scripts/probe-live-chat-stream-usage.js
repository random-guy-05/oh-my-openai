#!/usr/bin/env node
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");

const port = Number(process.env.CDR_PORT || 9366);
const output = path.join(__dirname, "..", "out", "probe-live-chat-stream-usage.json");

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
  const targets = await getJson(`http://127.0.0.1:${port}/json`);
  const page = targets.find((target) => (target.url || "").startsWith("app://"));
  if (!page) throw new Error("No app page target");
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 5000);
    socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const waiter = pending.get(message.id);
    pending.delete(message.id);
    message.error ? waiter.reject(new Error(JSON.stringify(message.error))) : waiter.resolve(message.result);
  });
  const send = (method, params = {}, timeoutMs = 8000) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, timeoutMs);
    pending.set(id, {
      resolve: (value) => { clearTimeout(timer); resolve(value); },
      reject: (error) => { clearTimeout(timer); reject(error); },
    });
    socket.send(JSON.stringify({ id, method, params }));
  });
  await send("Runtime.enable");
  const expression = `(async()=>{
    const client=globalThis.__cdrChatClient||globalThis.__cdrEnsureChatClient?.();
    if(!client||typeof client.startCompletionStream!=='function')return{ok:false,reason:'no client'};
    if(!(globalThis.__cdrChatPowerRows||[]).length)await client.models();
    const row=(globalThis.__cdrChatPowerRows||[]).find(row=>row.model===globalThis.__cdrChatDefaultSlug)||(globalThis.__cdrChatPowerRows||[])[0];
    if(!row)return{ok:false,reason:'no active model'};
    let response=null,assistant='',conversationId=null,parentMessageId=null;
    const events=[],updates=[];
    const clean=value=>{try{return JSON.parse(JSON.stringify(value))}catch{return String(value)}};
    await new Promise((resolve,reject)=>{
      let settled=false;
      const timer=setTimeout(()=>{if(!settled){settled=true;reject(new Error('stream timeout'))}},60000);
      const finish=fn=>value=>{if(settled)return;settled=true;clearTimeout(timer);fn(value)};
      client.startCompletionStream({
        request:{
          action:'next',client_prepare_state:'sent',
          messages:[{author:{role:'user'},content:{content_type:'text',parts:['Reply with exactly OK.']},id:crypto.randomUUID(),metadata:{}}],
          model:row.apiModel,parent_message_id:crypto.randomUUID(),
          thinking_effort:row.apiEffort==='none'?undefined:row.apiEffort,
          timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezone_offset_min:new Date().getTimezoneOffset()
        },
        onResponse:value=>{
          const headers={};
          try{for(const [key,item] of value.headers.entries())headers[key]=item}catch{}
          response={status:value?.status,statusText:value?.statusText,headers,keys:value?Object.keys(value):[]};
        },
        onEvent:event=>{
          let data=event?.data;
          if(typeof data==='string'){try{data=JSON.parse(data)}catch{}}
          if(data?.conversation_id)conversationId=data.conversation_id;
          events.push({type:event?.type,keys:event?Object.keys(event):[],data:clean(data)});
          if(events.length>30)events.shift();
        },
        onUpdate:update=>{
          if(update?.conversationId)conversationId=update.conversationId;
          const message=update?.message;
          if(message?.id)parentMessageId=message.id;
          const parts=message?.content?.parts;
          if(Array.isArray(parts))assistant=parts.filter(part=>typeof part==='string').join('');
          updates.push({type:update?.type,keys:update?Object.keys(update):[],message:message?{id:message.id,status:message.status,metadata:clean(message.metadata),contentType:message.content?.content_type}:null});
          if(updates.length>30)updates.shift();
        },
        onComplete:finish(resolve),
        onError:finish(error=>reject(error?.error||error))
      });
    });
    return{ok:true,model:row.apiModel,effort:row.apiEffort,response,assistant,conversationId,parentMessageId,events,updates};
  })()`;
  const evaluated = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, 70000);
  if (evaluated.exceptionDetails) throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
  const report = evaluated.result?.value;
  fs.writeFileSync(output, JSON.stringify(report, null, 2));
  socket.close();
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
