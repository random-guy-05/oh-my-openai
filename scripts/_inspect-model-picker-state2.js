#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SETTINGS = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const CHAT = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const PATCH = path.join(ROOT, "scripts/patch-local-canonical-mode.js");

const settings = fs.readFileSync(SETTINGS, "utf8");
const chat = fs.readFileSync(CHAT, "utf8");
const patch = fs.readFileSync(PATCH, "utf8");

// Extract installLocalModeRuntime / subscribe bits from mk
const mk = settings.indexOf("function mk({conversationId");
const mkEnd = settings.indexOf("function ", mk + 20);
const mkSrc = settings.slice(mk, Math.min(mk + 25000, mkEnd > mk ? mkEnd : mk + 25000));
console.log("mk length extract", mkSrc.length);

for (const pat of [
  "cdr-local-mode-change",
  "useSyncExternalStore",
  "addEventListener",
  "subscribe",
  "CDRMode",
  "mode()",
  "setMode",
  "registerModelController",
  "useState)(null),[CDRChatY",
  "chat-models-v38:load",
]) {
  const i = mkSrc.indexOf(pat);
  console.log("mk has", pat, i);
  if (i >= 0) console.log(" ", mkSrc.slice(Math.max(0, i - 60), i + 200).replace(/\n/g, " ").slice(0, 320));
}

// Find Cg and Ug definitions in whole settings - they may be minified differently
for (const pat of ["function Cg(", "Cg=function", "Cg=(e,", "Cg=(e)", "function io(", "io=function"]) {
  let i = -1;
  let c = 0;
  while (c < 5) {
    i = settings.indexOf(pat, i + 1);
    if (i < 0) break;
    // only near model picker helpers - look for supportedReasoningEfforts nearby
    const snip = settings.slice(i, i + 500);
    if (/reasoning|sol|terra|power|displayName|curated/i.test(snip) || c === 0) {
      console.log("HIT", pat, i, snip.replace(/\n/g, " ").slice(0, 450));
    }
    c++;
  }
}

// Search for curated filter that keeps sol/terra
for (const pat of ["gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "curated", "powerRows", "POWER"]) {
  let i = 0;
  let c = 0;
  while (c < 4) {
    i = settings.indexOf(pat, i);
    if (i < 0) break;
    console.log("CUR", pat, i, settings.slice(Math.max(0, i - 80), i + 180).replace(/\n/g, " ").slice(0, 280));
    i += pat.length;
    c++;
  }
}

// ChatGPT transform: find Un/Wn and options shape + placeholder or
const orIdx = chat.indexOf("placeholderData:or,queryFn:()=>e.get(L).models()");
console.log("\n--- chatgpt catalog ---");
console.log(chat.slice(Math.max(0, orIdx - 2000), orIdx + 800).replace(/\n/g, "\n").slice(0, 2500));

// Find slider / max thinking
for (const pat of ["max", "thinking_effort", "slider_settings", "defaultThinkingEffort"]) {
  // skip
}
const teIdx = chat.indexOf("slider_settings");
console.log("\n--- slider_settings context ---");
console.log(chat.slice(Math.max(0, teIdx - 400), teIdx + 900).slice(0, 1400));

// patch runtime subscribe
console.log("\n--- patch mode event ---");
for (const pat of ["cdr-local-mode-change", "dispatchEvent", "subscribe", "useSyncExternalStore", "getSnapshot"]) {
  const i = patch.indexOf(pat);
  console.log(pat, i);
  if (i >= 0) console.log(patch.slice(Math.max(0, i - 100), i + 300).slice(0, 400));
}
