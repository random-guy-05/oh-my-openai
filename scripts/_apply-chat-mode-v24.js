#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
);
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
  const page = fs.readFileSync(PAGE, "utf8");
  const qc = fs.readFileSync(QC, "utf8");
  assert(page.includes("native-chat-mode-v24"), "missing v24");
  assert(page.includes("CDRChatHome"), "missing CDRChatHome");
  assert(page.includes("n(`/chat?mode=chat`)"), "missing new chat route");
  assert(
    !page.includes(
      "function JUe(){try{if(localStorage.getItem(`cdr-product-mode`)===`chat`)",
    ),
    "unsafe JUe present",
  );
  assert(qc.includes("ue=((u)=>{try{"), "missing safe ue");
  assert(qc.includes(",CDRChatSticky=((()=>{"), "CDRChatSticky must stay in let");
  assert(qc.includes("if(p.startsWith(`/local`))return!1"), "missing sticky local guard");
  assert(qc.includes("Ee=CDRChatSticky?pe:"), "missing chat catalog sticky");
  assert(qc.includes("chat-origin-v15"), "missing chat origin");
  execFileSync("node", ["--check", PAGE], { stdio: "inherit" });
  execFileSync("node", ["--check", QC], { stdio: "inherit" });
  console.log("verify ok");
}

function syncSessions() {
  const app = path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/CodexHome",
  );
  const cli = path.join(os.homedir(), ".codex");
  if (!fs.existsSync(app)) return;
  for (const name of ["sessions", "archived_sessions", "session_index.jsonl"]) {
    const dest = path.join(app, name);
    const src = path.join(cli, name);
    const isDir = name !== "session_index.jsonl";
    if (isDir) fs.mkdirSync(src, { recursive: true });
    else if (!fs.existsSync(src)) continue;
    try {
      if (fs.lstatSync(dest).isSymbolicLink() && fs.realpathSync(dest) === fs.realpathSync(src)) {
        console.log("session ok", name);
        continue;
      }
    } catch {}
    if (fs.existsSync(dest) || fs.lstatSync(dest).isSymbolicLink?.()) {
      try {
        fs.rmSync(dest, { recursive: true, force: true });
      } catch {
        try {
          fs.unlinkSync(dest);
        } catch {}
      }
    }
    fs.symlinkSync(src, dest);
    console.log("linked", name);
  }
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-mode-v24.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v24-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
verify();
if (process.argv.includes("--check")) process.exit(0);
syncSessions();
install();
console.log("done — resign next");
