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
const REMOTE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js",
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
  const remote = fs.readFileSync(REMOTE, "utf8");
  assert(page.includes("native-chat-mode-v31"), "missing v31 marker");
  assert(
    page.includes("sidebarMode:`codex`,topContent:ee,chatMode:!1"),
    "sidebar not forced to codex",
  );
  assert(
    !page.includes("if(CDRChatMode)R=[(0,yR.jsx)(eAe,{chatMode:!0}"),
    "ChatGPT eAe branch still present",
  );
  assert(
    page.includes(
      "function NOe({showSearchNavItem:e,chatMode:t}){let r=(0,XF.jsx)(POe,{})",
    ),
    "New chat not always POe",
  );
  assert(
    page.includes(
      "function CDRChatHome(){try{localStorage.setItem(`cdr-product-mode`,`chat`);document.documentElement.setAttribute(`data-codex-product-mode`,`chat`)}catch{}return(0,g0.jsx)(Ni,{to:`/`,replace:!0})}",
    ),
    "CDRChatHome should redirect to /",
  );
  assert(!page.includes("/chat?mode=chat"), "page still navigates to ChatGPT home");
  assert(!remote.includes("/chat?mode=chat"), "remote handoff still uses ChatGPT home");
  execFileSync("node", ["--check", PAGE], { stdio: "inherit" });
  execFileSync("node", ["--check", REMOTE], { stdio: "inherit" });
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-unified-list-v31.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v31-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — run scripts/_resign-live-runtime.js next");
