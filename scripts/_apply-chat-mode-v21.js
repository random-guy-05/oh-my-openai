#!/usr/bin/env node
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const QC = path.join(
  ASSETS,
  "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const page = fs.readFileSync(PAGE, "utf8");
const qc = fs.readFileSync(QC, "utf8");

assert(page.includes("n(`/chat?mode=chat`)"), "New chat must go to /chat?mode=chat");
assert(page.includes("native-chat-mode-v21"), "missing v21 marker");
assert(
  page.includes("if(localStorage.getItem(`cdr-product-mode`)===`chat`)return(0,g0.jsx)(CDRChatHome,{})"),
  "JUe must route sticky chat to CDRChatHome",
);
assert(qc.includes("if(p.startsWith(`/local`))return!1"), "sticky must ignore /local");
assert(qc.includes("if(a===`work`||a===`codex`)return!1"), "sticky must honor work/codex attr");
assert(qc.includes("if(_m===`work`)u=`tpp`"), "work must force tpp origin for models");
assert(qc.includes("ue=((u)=>{try{"), "ue force must stay inside let chain");
assert(qc.includes("if(!_p.startsWith(`/local`))"), "origin force must spare /local");

console.log("verify ok");
if (process.argv.includes("--check")) process.exit(0);

function run(bin, args, opts = {}) {
  return execFileSync(bin, args, {
    encoding: "utf8",
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
  });
}

function syncCliSessions() {
  const cliHome = path.join(os.homedir(), ".codex");
  const appHome = path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/CodexHome",
  );
  if (!fs.existsSync(appHome)) {
    console.log("skip session sync; app CodexHome missing");
    return;
  }
  fs.mkdirSync(path.join(cliHome, "sessions"), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.join(cliHome, "archived_sessions"), { recursive: true, mode: 0o700 });

  for (const name of ["sessions", "archived_sessions", "session_index.jsonl"]) {
    const src = path.join(cliHome, name);
    const dest = path.join(appHome, name);
    const expectDir = name !== "session_index.jsonl";
    if (!fs.existsSync(src)) {
      if (expectDir) fs.mkdirSync(src, { recursive: true, mode: 0o700 });
      else continue;
    }
    let already = false;
    try {
      already = fs.lstatSync(dest).isSymbolicLink() && fs.realpathSync(dest) === fs.realpathSync(src);
    } catch {}
    if (already) {
      console.log("session link ok", name);
      continue;
    }
    if (fs.existsSync(dest)) {
      if (expectDir && fs.statSync(dest).isDirectory()) {
        const walk = (dir, base) => {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const from = path.join(dir, entry.name);
            const rel = path.join(base, entry.name);
            const to = path.join(src, rel);
            if (entry.isDirectory()) walk(from, rel);
            else if (!fs.existsSync(to)) {
              fs.mkdirSync(path.dirname(to), { recursive: true });
              fs.copyFileSync(from, to);
              console.log("merged", rel);
            }
          }
        };
        walk(dest, "");
      }
      const bak = `${dest}.pre-cli-sync`;
      if (fs.existsSync(bak)) fs.rmSync(bak, { recursive: true, force: true });
      fs.renameSync(dest, bak);
    }
    fs.symlinkSync(src, dest);
    console.log("linked", name, "->", src);
  }
}

function compileLauncher() {
  const out = path.join(os.tmpdir(), `CodexLauncher-v21-${Date.now()}`);
  run("/usr/bin/xcrun", [
    "clang",
    "-arch",
    "x86_64",
    "-fobjc-arc",
    "-Wall",
    "-Wextra",
    "-Wpedantic",
    "-Werror",
    "-mmacosx-version-min=13.0",
    "-framework",
    "Cocoa",
    path.join(ROOT, "launcher", "CodexLauncher.m"),
    "-o",
    out,
  ]);
  run("/usr/bin/codesign", [
    "--force",
    "--sign",
    "-",
    "--timestamp=none",
    "--options",
    "runtime",
    out,
  ]);
  const dest = "/Applications/Codex.app/Contents/MacOS/CodexLauncher";
  if (fs.existsSync(dest)) {
    fs.copyFileSync(dest, `${dest}.bak-v21-${Date.now()}`);
    fs.copyFileSync(out, dest);
    fs.chmodSync(dest, 0o755);
    console.log("installed launcher", dest);
  } else {
    console.log("skip launcher install; /Applications/Codex.app missing");
  }
}

syncCliSessions();
compileLauncher();

const packed = path.join(ROOT, "out", "app-chat-mode-v21.asar");
fs.mkdirSync(path.dirname(packed), { recursive: true });
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: ROOT,
  stdio: "inherit",
});

for (const dest of [
  path.join(
    process.env.HOME,
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
]) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  fs.copyFileSync(dest, `${dest}.bak-v21-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}

console.log("done — run scripts/_resign-live-runtime.js next");
