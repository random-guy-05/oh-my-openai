#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const QC = path.join(ASSETS, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js");
function assert(c, m) { if (!c) throw new Error(m); }
const page = fs.readFileSync(PAGE, "utf8");
const qc = fs.readFileSync(QC, "utf8");
assert(page.includes("n(`/chat?mode=chat`)"), "New chat must go to /chat?mode=chat");
assert(page.includes("native-chat-mode-v22"), "missing v22 marker");
assert(!page.includes("function JUe(){try{if(localStorage.getItem(`cdr-product-mode`)===`chat`)"), "JUe must not early-return before hooks");
assert(qc.includes("if(p.startsWith(`/local`))return!1"), "sticky must ignore /local");
assert(qc.includes("if(a===`work`||a===`codex`)return!1"), "sticky must honor work/codex attr");
assert(qc.includes("ue=((u)=>{try{"), "ue force must stay inside let chain");
assert(qc.includes("if(_m===`work`)u=`tpp`"), "work must force tpp origin for models");
console.log("verify ok");
if (process.argv.includes("--check")) process.exit(0);
const packed = path.join(ROOT, "out", "app-chat-mode-v22.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of [
  path.join(process.env.HOME, "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
]) {
  if (!fs.existsSync(dest)) { console.log("skip", dest); continue; }
  fs.copyFileSync(dest, `${dest}.bak-v22-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
console.log("done — resign next");
