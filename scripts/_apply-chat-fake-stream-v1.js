#!/usr/bin/env node
"use strict";

// chat-smooth-stream-v2 — Smooth real Chat-mode streaming without fake delay.
//
// Problem: ChatGPT stream snapshots can arrive in irregular bursts. Rendering
// every burst causes visual jumps, while waiting for the entire response and
// replaying it afterward adds fake latency and keeps the Stop state around.
//
// Solution:
// 1. Publish an empty streaming row immediately so the current task responds.
// 2. Keep the real stream as the source of truth and reveal toward its latest
//    snapshot on a short 32ms cadence.
// 3. Drain any small remainder for at most 650ms, then publish completed text.
//
// The send hook clears stream state when this returns, so Stop becomes Send.
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-smooth-stream-v2";

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
// A) Replace burst rendering with a bounded live smoother + thinking row
// B) Drain the live smoother briefly and publish the final completed row
function patchMain(source) {
  if (source.includes(MARKER + ":applied")) {
    // Idempotency: verify markers are present
    if (!source.includes(MARKER + ":thinking")) throw new Error("smooth-stream thinking marker missing on re-run");
    if (!source.includes(MARKER + ":live")) throw new Error("smooth-stream live marker missing on re-run");
    return source;
  }

  if (!source.includes("async function CDRStickyChatSend(")) {
    throw new Error("CDRStickyChatSend bridge is missing — run _apply-26721-all-features.js first");
  }

  // ─── A) Smooth the live snapshots + add thinking upsert ───
  const flushOld =
    "let flushTimer=null;\n" +
    "let flush=()=>{if(flushTimer!=null){clearTimeout(flushTimer);flushTimer=null}if(assistant)upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'streaming'})};\n" +
    "let scheduleFlush=()=>{if(flushTimer==null)flushTimer=setTimeout(flush,45)};\n" +
    "try{\n" +
    "await new Promise((resolve,reject)=>{";

  const flushNew =
    "let flushTimer=null,displayed='';\n" +
    "let scheduleFlush=()=>{if(flushTimer==null)flushTimer=setTimeout(flush,32)};\n" +
    "let flush=()=>{/* " + MARKER + ":live */flushTimer=null;if(!assistant)return;if(!assistant.startsWith(displayed))displayed='';let remaining=assistant.length-displayed.length;if(remaining<=0)return;let step=Math.max(1,Math.min(remaining,Math.ceil(remaining*.35)));displayed=assistant.slice(0,displayed.length+step);upsert({id:assistantId,role:'assistant',text:displayed,source:'chat',status:'streaming'});if(displayed.length<assistant.length)scheduleFlush()};\n" +
    "/* " + MARKER + ":thinking */\n" +
    "upsert({id:assistantId,role:'assistant',text:'',source:'chat',status:'streaming'});\n" +
    "try{\n" +
    "await new Promise((resolve,reject)=>{";

  if (source.includes(flushOld)) {
    source = replaceOne(source, flushOld, flushNew, "install live stream smoother + thinking upsert");
  } else {
    throw new Error("stream flush anchor not found — bridge may have drifted");
  }

  // ─── B) Drain the live smoother, then complete ───
  const postStreamOld =
    "flush();\n" +
    "if(!assistant)assistant='Chat returned no displayable text.';\n" +
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});";

  const postStreamNew =
    "if(!assistant)assistant='Chat returned no displayable text.';\n" +
    "/* " + MARKER + ":drain */scheduleFlush();\n" +
    "{let _deadline=Date.now()+650;while(displayed.length<assistant.length&&Date.now()<_deadline)await new Promise(r=>setTimeout(r,16))}\n" +
    "if(flushTimer!=null){clearTimeout(flushTimer);flushTimer=null}displayed=assistant;\n" +
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});";

  if (source.includes(postStreamOld)) {
    source = replaceOne(source, postStreamOld, postStreamNew, "bounded live-stream drain");
  } else {
    throw new Error("post-stream flush anchor not found — bridge may have drifted");
  }

  // ─── Verify + mark applied ───
  if (!source.includes(MARKER + ":thinking")) throw new Error("thinking marker did not land");
  if (!source.includes(MARKER + ":live")) throw new Error("live smoother marker did not land");

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
  console.log(process.argv.includes("--check") ? "chat smooth-stream check ok" : "chat smooth-stream patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { MARKER, patchMain };
