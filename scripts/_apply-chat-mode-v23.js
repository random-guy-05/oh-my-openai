#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync, execSync } = require("child_process");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const QC = path.join(ASSETS, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js");
const V20_PAGE = "/tmp/page-v20.js";
const V20_QC = "/tmp/qc-v20.js";
const V20_ASAR = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar.bak-v20clean-1784341784913",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, {
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
    cwd: opts.cwd || ROOT,
  });
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

function ensureV20Sources() {
  if (!fs.existsSync(V20_PAGE) || !fs.existsSync(V20_QC)) {
    assert(fs.existsSync(V20_ASAR), "v20clean asar backup missing");
    const td = fs.mkdtempSync(path.join(os.tmpdir(), "v20-"));
    run("npx", [
      "asar",
      "extract-file",
      V20_ASAR,
      "webview/assets/app-initial~app-main~page-ClBbNyfy.js",
    ], { cwd: td, stdio: "inherit" });
    run("npx", [
      "asar",
      "extract-file",
      V20_ASAR,
      "webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
    ], { cwd: td, stdio: "inherit" });
    fs.copyFileSync(
      path.join(td, "app-initial~app-main~page-ClBbNyfy.js"),
      V20_PAGE,
    );
    fs.copyFileSync(
      path.join(td, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"),
      V20_QC,
    );
  }
  fs.copyFileSync(V20_QC, QC);
  fs.copyFileSync(V20_PAGE, PAGE);

  let page = fs.readFileSync(PAGE, "utf8");
  const marker = "id:`sidebarElectron.newChat`";
  const idx = page.indexOf(marker);
  assert(idx >= 0, "newChat marker missing");
  const start = page.lastIndexOf("onClick:()=>{n(`/`)}", idx);
  assert(start >= 0, "New chat onClick missing");
  page =
    page.slice(0, start) +
    "onClick:()=>{n(`/chat?mode=chat`)}" +
    page.slice(start + "onClick:()=>{n(`/`)}".length);
  assert(page.includes("native-chat-mode-v20"), "v20 marker missing");
  page = page.replace("native-chat-mode-v20", "native-chat-mode-v23");
  fs.writeFileSync(PAGE, page);
}

function verify() {
  const page = fs.readFileSync(PAGE, "utf8");
  const qc = fs.readFileSync(QC, "utf8");
  assert(page.includes("n(`/chat?mode=chat`)"), "New chat route missing");
  assert(page.includes("native-chat-mode-v23"), "v23 marker missing");
  assert(
    !page.includes("function JUe(){try{if(localStorage.getItem(`cdr-product-mode`)===`chat`)"),
    "unsafe JUe early-return present",
  );
  assert(!qc.includes("ue=((u)=>{try{"), "bad ue IIFE present");
  assert(!qc.includes("if(p.startsWith(`/local`))return!1"), "v21 sticky present");
  run("node", ["--check", PAGE]);
  run("node", ["--check", QC]);
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-mode-v23.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v23-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
ensureV20Sources();
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — resign next");
