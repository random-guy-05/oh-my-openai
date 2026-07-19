#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");

// Find which import statement contains "Eg as dt"
const egIdx = page.indexOf("Eg as dt");
console.log("Eg as dt at", egIdx);
// walk backward to import{ and forward to from"
let start = page.lastIndexOf("import{", egIdx);
let end = page.indexOf("};", egIdx); // wrong
const fromIdx = page.indexOf("}from\"", egIdx);
const fromFile = page.slice(fromIdx, fromIdx + 200).match(/\}from"([^"]+)"/)?.[1];
console.log("from", fromFile);

const file = path.join(assets, fromFile.replace(/^\.\//, ""));
const src = fs.readFileSync(file, "utf8");
const exportIdx = src.lastIndexOf("export{");
const chunk = src.slice(exportIdx);
const mm = chunk.match(/([A-Za-z0-9_$]+) as Eg[,}]/);
console.log("Eg is", mm?.[1]);

const name = mm?.[1];
if (name) {
  for (const p of [`function ${name}(`, `${name}=e=>`, `${name}=t=>`, `async function ${name}(`]) {
    const i = src.indexOf(p);
    if (i >= 0) {
      console.log("\ndef via", p);
      console.log(src.slice(i, i + 400));
      break;
    }
  }
}

// Also dump GS usage - in as GS from quick-chat - used for chatgpt search open
const gs = page.indexOf("function GS(");
console.log("\nGS in page", gs);
const gsUse = page.indexOf("GS(e,t.conversationId");
console.log("GS use", gsUse);
if (gsUse >= 0) console.log(page.slice(gsUse - 50, gsUse + 200));

// Find how chatgpt conversation page is routed - look at Routes
for (const needle of [
  "chatgpt-conversation",
  "path:`/chatgpt",
  "path:`/c/",
  "ConversationPage",
  "`/threads/",
  "path:`/conversation",
]) {
  console.log(needle, page.indexOf(needle));
}

// Find dt( usage results - what routes look like by finding string templates near conversation routes in Jhe source (quick)
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");
// Ky was exported as dt from quick - check
const ky = quick.indexOf("function Ky(");
console.log("\nKy in quick", ky);
if (ky >= 0) console.log(quick.slice(ky, ky + 300));
for (const p of ["Ky=e=>", "Ky=t=>", "function Ky(", "Ky=e=>`"]) {
  const i = quick.indexOf(p);
  if (i >= 0) console.log(p, quick.slice(i, i + 200));
}
