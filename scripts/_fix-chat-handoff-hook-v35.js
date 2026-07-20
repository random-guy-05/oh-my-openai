#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const PAGE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
);
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|fix-chat|apply-/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (Number.isFinite(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {}
      }
    }
  } catch {}
}

const page = fs.readFileSync(PAGE, "utf8");
if (!page.includes("CDROpenLocalThread=qx()")) {
  throw new Error("missing top-level qx() hook call");
}
if (!page.includes("chat-local-handoff-v35")) {
  throw new Error("missing handoff v35 marker");
}
// Ensure mode-select no longer calls qx() inside callbacks in mje
const mjeStart = page.indexOf("function mje(");
const mjeChunk = page.slice(mjeStart, mjeStart + 12000);
const qxInMje = (mjeChunk.match(/qx\(\)/g) || []).length;
if (qxInMje !== 1) {
  throw new Error(`expected 1 qx() in mje, found ${qxInMje}`);
}
acorn.parse(page, { ecmaVersion: "latest", sourceType: "module" });
console.log("verify ok");

killCodex();
const packed = path.join(ROOT, "out", "app-chat-handoff-hook-v35.asar");
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
  fs.copyFileSync(dest, `${dest}.bak-pre-v35-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}
console.log("done — resign next");
