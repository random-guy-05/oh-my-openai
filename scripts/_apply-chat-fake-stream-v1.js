#!/usr/bin/env node
"use strict";

// chat-fake-stream-v1 — Smooth Chat-mode streaming animation.
//
// Problem: During a Chat-mode send, the real ChatGPT API delivers text in
// irregular bursts (via scheduleFlush at 45ms). This looks "not smooth".
//
// Solution:
// 1. Suppress all intermediate flushes during the real API call (no-op
//    scheduleFlush). Instead, immediately upsert an empty status:'streaming'
//    entry so the UI shows a "thinking" indicator.
// 2. After the full response arrives (the await Promise resolves), animate the
//    text word-by-word with timed delays, upserting progressively longer text
//    with status:'streaming'.
// 3. When the animation completes, upsert the full text with status:'completed'.
//
// Because CDRStickyChatSend is async and the send hook awaits it, the stop
// button stays visible throughout (thinking + animation). When the bridge
// returns, the send hook clears streamState, so stop button reverts to send.
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-fake-stream-v1";

function asset(prefix) {
  const name = fs.readdirSync(ASSETS).find((f) => f.startsWith(prefix) && f.endsWith(".js"));
  if (!name) throw new Error(`missing ${prefix} bundle`);
  return path.join(ASSETS, name);
}

function replaceOne(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 target, found ${count}`);
  return source.replace(oldValue, newValue);
}

// Patch the CDRStickyChatSend bridge in the monolith.
// Two surgical replacements inside CDRStickyChatSend:
//
// A) Suppress intermediate flushes + add thinking upsert
// B) Replace post-stream flush with word-by-word animation
function patchMain(source) {
  if (source.includes(MARKER + ":applied")) {
    // Idempotency: verify markers are present
    if (!source.includes(MARKER + ":thinking")) throw new Error("fake-stream thinking marker missing on re-run");
    if (!source.includes(MARKER + ":animate")) throw new Error("fake-stream animate marker missing on re-run");
    return source;
  }

  if (!source.includes("async function CDRStickyChatSend(")) {
    throw new Error("CDRStickyChatSend bridge is missing — run _apply-26721-all-features.js first");
  }

  // ─── A) Suppress intermediate flushes + add thinking upsert ───
  const flushOld =
    "let scheduleFlush=()=>{if(flushTimer==null)flushTimer=setTimeout(flush,45)};\n" +
    "try{\n" +
    "await new Promise((resolve,reject)=>{";

  const flushNew =
    "let scheduleFlush=()=>{};\n" +
    "/* " + MARKER + ":thinking */\n" +
    "upsert({id:assistantId,role:'assistant',text:'',source:'chat',status:'streaming'});\n" +
    "try{\n" +
    "await new Promise((resolve,reject)=>{";

  if (source.includes(flushOld)) {
    source = replaceOne(source, flushOld, flushNew, "suppress intermediate flushes + thinking upsert");
  } else {
    throw new Error("scheduleFlush anchor not found — bridge may have drifted");
  }

  // ─── B) Replace post-stream flush with word-by-word animation ───
  const postStreamOld =
    "flush();\n" +
    "if(!assistant)assistant='Chat returned no displayable text.';\n" +
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});";

  // Animation: split into words, reveal progressively, ~2s total, max 60 steps.
  // Each step upserts with status:'streaming' so the UI shows incremental text.
  // Final upsert with status:'completed' signals the UI to stop the spinner.
  const postStreamNew =
    "if(flushTimer!=null){clearTimeout(flushTimer);flushTimer=null}\n" +
    "if(!assistant)assistant='Chat returned no displayable text.';\n" +
    "/* " + MARKER + ":animate */\n" +
    "{let _w=assistant.split(/(\\s+)/),_total=_w.length,_step=Math.max(1,Math.ceil(_total/60)),_s=0,_ms=Math.min(50,Math.max(12,Math.ceil(2000/Math.ceil(_total/_step))));" +
    "while(_s<_total){_s=Math.min(_total,_s+_step);" +
    "upsert({id:assistantId,role:'assistant',text:_w.slice(0,_s).join(''),source:'chat',status:'streaming'});" +
    "await new Promise(r=>setTimeout(r,_ms))}}\n" +
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});\n" +
    "/* codex-rebuild:bugfix-v1:stop */\n" +
    "try{if(e&&e.streamState){if(e.streamState.streamingConversations)e.streamState.streamingConversations.delete(t);if(typeof e.streamState.deleteConversationStreamRole==='function')e.streamState.deleteConversationStreamRole(t);else if(typeof e.streamState.setConversationStreamRole==='function')e.streamState.setConversationStreamRole(t,null);if(typeof e.streamState.clearConversationStreaming==='function')e.streamState.clearConversationStreaming(t)}if(e&&typeof e.setConversationStreamRole==='function')e.setConversationStreamRole(t,null);if(e&&typeof e.notifyConversationUpdated==='function')e.notifyConversationUpdated(t);if(e&&typeof e.broadcastConversationSnapshot==='function')e.broadcastConversationSnapshot(t)}catch{}\n" +
    "try{window.dispatchEvent(new CustomEvent('cdr-thread-extras-change',{detail:{key:(String(t||'').includes(':')?t:'local:'+t),rows:null}}))}catch{}";

  if (source.includes(postStreamOld)) {
    source = replaceOne(source, postStreamOld, postStreamNew, "word-by-word animation");
  } else {
    throw new Error("post-stream flush anchor not found — bridge may have drifted");
  }

  // ─── Verify + mark applied ───
  if (!source.includes(MARKER + ":thinking")) throw new Error("thinking marker did not land");
  if (!source.includes(MARKER + ":animate")) throw new Error("animate marker did not land");

  // Parse-check the modified monolith
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error("parse failed after fake-stream patch: " + e.message);
  }

  source += "\n/* " + MARKER + ":applied */\n";
  return source;
}

function main() {
  const mainFile = asset("app-initial-");
  const source = fs.readFileSync(mainFile, "utf8");
  const next = patchMain(source);
  if (!process.argv.includes("--check") && next !== source) {
    fs.writeFileSync(mainFile, next);
  }
  console.log(process.argv.includes("--check") ? "chat fake-stream check ok" : "chat fake-stream patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { MARKER, patchMain };
