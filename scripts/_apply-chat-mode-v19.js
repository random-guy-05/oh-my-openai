#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
function assert(c, m) { if (!c) throw new Error(m); }
const qc = fs.readFileSync(path.join(ASSETS, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");
const catalog = fs.readFileSync(path.join(ASSETS, "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js"), "utf8");
assert(qc.includes("CDRFixedChatModels"), "missing fixed chat models");
assert(qc.includes("location.pathname===`/chat`"), "missing route sticky");
assert(catalog.includes("chat-catalog-v6:merge"), "missing chat catalog v6");
assert(catalog.includes("chat-catalog-v6:tpp"), "missing work tpp catalog");
assert(catalog.includes("selectedLabel:`5.6 Terra`"), "work missing Terra");
// Chat models() must not list Terra
const modelsFn = catalog.slice(catalog.indexOf("async models(){"), catalog.indexOf("/* codex-rebuild:chat-catalog-v6:merge */"));
assert(!modelsFn.includes("5.6 Terra"), "Chat models() still has Terra");
assert(modelsFn.includes("5.6 Sol High"), "Chat models() missing Sol High");
console.log("verify ok");
if (process.argv.includes("--check")) process.exit(0);
const packed = path.join(ROOT, "out", "app-chat-mode-v19.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of [
  path.join(process.env.HOME, "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
]) {
  if (!fs.existsSync(dest)) { console.log("skip", dest); continue; }
  fs.copyFileSync(dest, `${dest}.bak-v19-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
console.log("done");
