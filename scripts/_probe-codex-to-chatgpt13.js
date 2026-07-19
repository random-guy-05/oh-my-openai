#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");

function dump(src, needle, before = 100, after = 600) {
  const i = src.indexOf(needle);
  console.log("\n====", needle, i);
  if (i < 0) return;
  console.log(src.slice(Math.max(0, i - before), i + after));
}

dump(page, "Jhe({tppOnly:!CDRChatMode})", 50, 100);
dump(page, "function Jhe(", 0, 1500);
// maybe Jhe is imported
dump(page, "Jhe=", 20, 200);
dump(page, " as Jhe,", 40, 80);

dump(quick, "Local execution targets require", 200, 400);
dump(quick, "async function Dm(", 0, 2000);
dump(quick, "function Dm(", 0, 2000);
dump(quick, "conversationOrigin:null", 80, 300);
dump(quick, "yc({conversationId:", 80, 400);

// How chatgpt conversation routes look
dump(page, "route:`/conversation/", 40, 200);
dump(page, "dt=", 20, 200);
dump(page, "function dt(", 0, 400);

// Find route builder for chatgpt conversations in page via CE( or similar
for (const needle of ["CE=e=>", "function CE(", "dt=e=>", "`/conversation/${", "conversation/${e}"]) {
  dump(page, needle, 20, 200);
}

// Patch idea: when CDRChatMode, sidebar click for codex should navigate differently.
// Dump exact click handler for patching.
dump(page, "z=({target:t})=>{if(t.source===`chatgpt`){r(t.target.route);return}Aw(e,t.threadKey,i,r)}", 0, 200);

// Also d6 open handler
dump(page, "function d6(e,t,n,r,i){switch(t.kind){case`local`:case`remote`:Aw(e,t.threadKey,n,r);return;case`chatgpt`:", 0, 300);
