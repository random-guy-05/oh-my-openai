#!/usr/bin/env node
"use strict";

// chat-smooth-stream-v3 — Responsive real Chat-mode streaming.
//
// ChatGPT stream snapshots can arrive in irregular bursts. Publish an
// immediate visible state, coalesce real snapshots to one paint-sized cadence,
// and commit the terminal response immediately so Stop returns to Send.
//
// Solution:
// There is deliberately no post-response typewriter replay or drain delay.
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:chat-smooth-stream-v3";

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
// A) Coalesce burst rendering and publish a visible thinking row.
// B) Cancel any pending paint and publish the final row immediately.
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
    "let flushTimer=null;\n" +
    "let flush=()=>{/* " + MARKER + ":live */flushTimer=null;if(assistant)upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'streaming'})};\n" +
    "let scheduleFlush=()=>{if(flushTimer==null)flushTimer=setTimeout(flush,16)};\n" +
    "/* " + MARKER + ":thinking */\n" +
    "upsert({id:assistantId,role:'assistant',text:'Thinking…',source:'chat',status:'streaming'});\n" +
    "try{\n" +
    "await new Promise((resolve,reject)=>{";

  if (source.includes(flushOld)) {
    source = replaceOne(source, flushOld, flushNew, "install live stream smoother + thinking upsert");
  } else {
    throw new Error("stream flush anchor not found — bridge may have drifted");
  }

  // ─── B) Complete immediately ───
  const postStreamOld =
    "flush();\n" +
    "if(!assistant)assistant='Chat returned no displayable text.';\n" +
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});";

  const postStreamNew =
    "if(!assistant)assistant='Chat returned no displayable text.';\n" +
    "/* " + MARKER + ":complete */if(flushTimer!=null){clearTimeout(flushTimer);flushTimer=null}\n" +
    "upsert({id:assistantId,role:'assistant',text:assistant,source:'chat',status:'completed'});";

  if (source.includes(postStreamOld)) {
    source = replaceOne(source, postStreamOld, postStreamNew, "immediate stream completion");
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
