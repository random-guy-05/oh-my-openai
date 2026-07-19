#!/usr/bin/env node
"use strict";
const fs = require("fs");
const quick = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
  "utf8",
);
const i = quick.indexOf("function hS(e){");
console.log("hS at", i);
// find submit / Dm( / onSubmit inside hS - hS is long, search for key patterns after i
const body = quick.slice(i, i + 25000);
for (const n of ["Dm(", "onSubmitAccepted", "submitPrompt", "handleSubmit", "onKeyDown", "Enter", "startCompletion", "async()=>{", "autoPrepare"]) {
  console.log(n, body.indexOf(n));
}
const sub = body.indexOf("onSubmitAccepted");
console.log(body.slice(sub - 100, sub + 500));
const dm = body.indexOf("Dm(");
console.log("\nDm context", body.slice(dm - 150, dm + 400));
