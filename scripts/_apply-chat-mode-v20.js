#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const catalog = fs.readFileSync(path.join(ASSETS, "app-initial~app-main~onboarding-page~projects-index-page~hotkey-window-thread-page~quick-ch~c6svlhqw-CWfXNvXw.js"), "utf8");
const qc = fs.readFileSync(path.join(ASSETS, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");
if (!catalog.includes("async models(){return IL(await this.request.getModelsResponse())}")) throw new Error("models not restored");
if (!catalog.includes("async tppModels(){return IL(await this.request.getTppModelsResponse())}")) throw new Error("tpp not restored");
if (qc.includes("CDRFixedChatModels")) throw new Error("fixed models still present");
if (!qc.includes("Ee=CDRChatSticky?pe:")) throw new Error("sticky pe missing");
console.log("verify ok");
if (process.argv.includes("--check")) process.exit(0);
const packed = path.join(ROOT, "out", "app-chat-mode-v20.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], { cwd: ROOT, stdio: "inherit" });
for (const dest of [
  path.join(process.env.HOME, "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
]) {
  if (!fs.existsSync(dest)) continue;
  fs.copyFileSync(dest, `${dest}.bak-v20-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
console.log("done");
