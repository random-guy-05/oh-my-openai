#!/usr/bin/env node
"use strict";

/**
 * Make same-task Chat sends feel native:
 * - publish fresh transcript rows directly to the mounted task view;
 * - never let an older IndexedDB read replace newer local rows;
 * - finish the submit action on Chat's terminal message event;
 * - propagate async startCompletionStream failures into the submit promise.
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const { patch: patchThread } = require("./_apply-chat-extras-render-v1");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src", "mac-x64", "_asar", "webview", "assets");
const MARKER = "codex-rebuild:chat-stream-lifecycle-v1";

function asset(test) {
  const name = fs.readdirSync(ASSETS).find(test);
  if (!name) throw new Error("required Chat lifecycle bundle is missing");
  return path.join(ASSETS, name);
}

function replaceOne(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 target, found ${count}`);
  return source.replace(oldValue, newValue);
}

function verifyMain(source) {
  const required = [
    "detail:{key,rows:Array.isArray(rows)?rows:null}",
    "notify(rows);return val.id",
    "let finish=done(()=>resolve());",
    "Promise.resolve(client.startCompletionStream({",
    "d.message.end_turn===true",
    "onComplete:finish",
    ")).catch(done(reject));",
  ];
  for (const needle of required) {
    if (!source.includes(needle)) throw new Error(`Chat lifecycle invariant missing: ${needle}`);
  }
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
}

function patchMain(source) {
  if (!source.includes("async function CDRStickyChatSend(")) {
    throw new Error("CDRStickyChatSend is missing");
  }
  if (source.includes(MARKER + ":applied")) {
    verifyMain(source);
    return source;
  }

  const oldNotify = "let notify=()=>{try{window.dispatchEvent(new CustomEvent('cdr-thread-extras-change',{detail:{key}}))}catch{}};";
  const newNotify = "let notify=rows=>{try{window.dispatchEvent(new CustomEvent('cdr-thread-extras-change',{detail:{key,rows:Array.isArray(rows)?rows:null}}))}catch{}};";
  if (source.includes(oldNotify)) source = replaceOne(source, oldNotify, newNotify, "row-carrying transcript event");
  if (!source.includes(newNotify)) throw new Error("row-carrying transcript event did not land");

  const oldNotifyCall = "}catch{}notify();return val.id};";
  const newNotifyCall = "}catch{}notify(rows);return val.id};";
  if (source.includes(oldNotifyCall)) source = replaceOne(source, oldNotifyCall, newNotifyCall, "fresh row publication");
  if (!source.includes(newNotifyCall)) throw new Error("fresh row publication did not land");

  const oldStart = "let done=fn=>v=>{if(settled)return;settled=!0;clearTimeout(timer);fn(v)};\ntry{\nclient.startCompletionStream({";
  const newStart = "let done=fn=>v=>{if(settled)return;settled=!0;clearTimeout(timer);fn(v)};\nlet finish=done(()=>resolve());\ntry{\nPromise.resolve(client.startCompletionStream({";
  if (source.includes(oldStart)) source = replaceOne(source, oldStart, newStart, "stream promise start");

  const oldEvent = "onEvent:ev=>{try{let d=ev&&ev.data;if(!d)return;if(typeof d==='string'){try{d=JSON.parse(d)}catch{return}}let cid=d.conversation_id||d.conversationId;if(cid)seenConv=cid;if(d.message&&d.message.id)nextParent=d.message.id;let parts=d.message&&d.message.content&&d.message.content.parts;if(Array.isArray(parts)){let snap=parts.map(textOf).join('');if(snap){assistant=snap;scheduleFlush()}}}catch{}},\nonComplete:done(()=>resolve()),";
  const newEvent = "onEvent:ev=>{try{let d=ev&&ev.data;if(!d)return;if(typeof d==='string'){try{d=JSON.parse(d)}catch{return}}let cid=d.conversation_id||d.conversationId;if(cid)seenConv=cid;if(d.message&&d.message.id)nextParent=d.message.id;let parts=d.message&&d.message.content&&d.message.content.parts;if(Array.isArray(parts)){let snap=parts.map(textOf).join('');if(snap){assistant=snap;scheduleFlush()}}let terminal=d.type==='complete'||d.type==='done'||d.message&&d.message.end_turn===true||d.message&&(['completed','finished_successfully'].includes(d.message.status));if(terminal)queueMicrotask(()=>finish())}catch{}},\nonComplete:finish,";
  if (source.includes(oldEvent)) source = replaceOne(source, oldEvent, newEvent, "terminal Chat event");

  const oldEnd = "onError:done(err=>reject(err&&err.error?err.error:err))\n});\n}catch(err){done(reject)(err)}";
  const newEnd = "onError:done(err=>reject(err&&err.error?err.error:err))\n})).catch(done(reject));\n}catch(err){done(reject)(err)}";
  if (source.includes(oldEnd)) source = replaceOne(source, oldEnd, newEnd, "stream rejection propagation");

  source += `\n/* ${MARKER}:applied */\n`;
  verifyMain(source);
  return source;
}

function main() {
  const mainFile = asset((name) => name.startsWith("app-initial-") && name.endsWith(".js"));
  const threadFile = asset((name) => name.includes("local-conversation-thread") && name.endsWith(".js"));
  const mainSource = fs.readFileSync(mainFile, "utf8");
  const threadSource = fs.readFileSync(threadFile, "utf8");
  const nextMain = patchMain(mainSource);
  const nextThread = patchThread(threadSource, threadFile);
  if (!process.argv.includes("--check")) {
    if (nextMain !== mainSource) fs.writeFileSync(mainFile, nextMain);
    if (nextThread !== threadSource) fs.writeFileSync(threadFile, nextThread);
  }
  console.log(process.argv.includes("--check") ? "chat stream lifecycle check ok" : "chat stream lifecycle patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { MARKER, patchMain, verifyMain };
