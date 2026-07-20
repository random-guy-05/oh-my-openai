#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const QC = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|fix-loading|apply-model/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    }
  } catch {}
}

const src = fs.readFileSync(QC, "utf8");
if (src.includes("Ee=((()=>{/* codex-rebuild:catalog-")) {
  throw new Error("broken catalog double-paren still present");
}
if (
  !src.includes("Ee=(()=>{/* codex-rebuild:catalog-v33 */") &&
  !src.includes("Ee=(()=>{/* codex-rebuild:catalog-v32 */")
) {
  throw new Error("balanced catalog IIFE missing");
}
if (
  !src.includes("Be=(()=>{/* codex-rebuild:model-remap-v33 */") &&
  !src.includes("Be=(()=>{/* codex-rebuild:model-remap-v32 */")
) {
  throw new Error("balanced remap IIFE missing");
}
acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
console.log("source parse OK");

killCodex();

const packed = path.join(ROOT, "out", "app-model-picker-v33-fix.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: ROOT,
  stdio: "inherit",
});

for (const dest of [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
]) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  fs.copyFileSync(dest, `${dest}.bak-pre-v33fix-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}

console.log("done — resign next");
