#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const QC = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);

function assert(c, m) {
  if (!c) throw new Error(m);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function verify() {
  const qc = fs.readFileSync(QC, "utf8");
  assert(qc.includes("chat-origin-picker-v32"), "missing picker origin v32");
  assert(qc.includes("chat-sticky-v32"), "missing sticky v32");
  assert(qc.includes("model-remap-v32"), "missing model remap v32");
  assert(qc.includes("catalog-v32"), "missing catalog v32");
  assert(qc.includes("chat-origin-v32"), "missing origin v32");
  assert(!qc.includes("!_p.startsWith(`/local`)&&_m===`work`"), "local work guard still present");
  execFileSync("node", ["--check", QC], { stdio: "inherit" });
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-model-picker-v32.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v32-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — run scripts/_resign-live-runtime.js next");
