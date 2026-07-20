#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const QC = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);
const WH = path.join(ROOT, "src/mac-x64/_asar/webview/assets/work-home-page-CA5VNwMV.js");

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|apply-model|catalog-v33/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    }
  } catch {}
}

function verify() {
  const qc = fs.readFileSync(QC, "utf8");
  const wh = fs.readFileSync(WH, "utf8");
  if (!qc.includes("catalog-v33")) throw new Error("missing catalog-v33");
  if (!qc.includes("model-remap-v33")) throw new Error("missing remap-v33");
  if (!qc.includes("__cdrCodexPickerModels")) throw new Error("missing stable codex catalog");
  if (!qc.includes("gpt-5.6-terra")) throw new Error("missing terra");
  if (qc.includes("Ee=((()=>{")) throw new Error("broken double-paren Ee");
  if (!wh.includes("key:((()=>{try{return localStorage.getItem(`cdr-product-mode`)")) {
    throw new Error("work-home missing mode remount key");
  }
  acorn.parse(qc, { ecmaVersion: "latest", sourceType: "module" });
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-model-catalog-v33.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v33-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — run scripts/_resign-live-runtime.js next");
