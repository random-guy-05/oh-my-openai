#!/usr/bin/env node
"use strict";
/**
 * mode-switch-work-v1 — Fix ChatGPT → Chat snap-back.
 * Durable sync only guarded against upstream "codex"; upstream "work"
 * was overwriting local chat immediately after onModeSelect.
 */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:mode-switch-work-v1";
const monoName = fs
  .readdirSync(ASSETS)
  .find((f) => f.startsWith("app-initial-") && f.endsWith(".js"));
if (!monoName) throw new Error("app-initial not found");
const MONO = path.join(ASSETS, monoName);

const OLD =
  "(0,L$.useEffect)(()=>{if(CDRUpstreamMode===`codex`){try{if(CDRRuntime.mode(`codex`)===`chat`)return}catch{}}CDRRuntime.setMode(CDRUpstreamMode);CDRSetMode(CDRUpstreamMode)},[CDRUpstreamMode]);";

const OLD2 =
  "(0,L$.useEffect)(()=>{/* codex-rebuild:sticky-chat-v43:durable-sync */if(CDRUpstreamMode===`codex`){try{if(CDRRuntime.mode(`codex`)===`chat`)return}catch{}}CDRRuntime.setMode(CDRUpstreamMode);CDRSetMode(CDRUpstreamMode)},[CDRUpstreamMode]);";

const NEXT =
  `(0,L$.useEffect)(()=>{/* ${MARKER}:durable-sync */if(CDRUpstreamMode!==\`chat\`){try{if(CDRRuntime.mode(\`codex\`)===\`chat\`)return}catch{}}CDRRuntime.setMode(CDRUpstreamMode);CDRSetMode(CDRUpstreamMode)},[CDRUpstreamMode]);`;

function main() {
  let mono = fs.readFileSync(MONO, "utf8");
  if (mono.includes(MARKER + ":durable-sync")) {
    console.log("[skip] already applied");
    return;
  }

  let n = 0;
  if (mono.includes(OLD)) {
    mono = mono.split(OLD).join(NEXT);
    n = (mono.split(MARKER + ":durable-sync").length - 1);
    console.log("[ok] replaced durable-sync (plain)", n);
  } else if (mono.includes(OLD2)) {
    // shouldn't happen with sticky marker only on comment nearby
    mono = mono.split(OLD2).join(NEXT);
    console.log("[ok] replaced durable-sync (marked)");
  } else {
    // Fuzzy: any durable-sync effect that only checks codex
    const re =
      /\(0,L\$\.useEffect\)\(\(\)=>\{(?:\/\* [^*]+ \*\/)?if\(CDRUpstreamMode===`codex`\)\{try\{if\(CDRRuntime\.mode\(`codex`\)===`chat`\)return\}catch\{\}\}CDRRuntime\.setMode\(CDRUpstreamMode\);CDRSetMode\(CDRUpstreamMode\)\},\[CDRUpstreamMode\]\);/;
    if (!re.test(mono)) throw new Error("durable-sync site not found");
    mono = mono.replace(re, NEXT);
    console.log("[ok] replaced durable-sync (fuzzy)");
  }

  if (!mono.includes(MARKER + ":durable-sync")) {
    throw new Error("replacement did not land");
  }

  try {
    acorn.parse(mono, {
      ecmaVersion: "latest",
      sourceType: "module",
      allowReturnOutsideFunction: true,
    });
  } catch (e) {
    throw new Error("parse failed: " + e.message);
  }
  fs.writeFileSync(MONO, mono);
  console.log("[ok] written");
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error("[fail]", e.message);
    process.exit(1);
  }
}
module.exports = { MARKER };
