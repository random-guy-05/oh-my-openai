#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const LOCAL = path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js");
const TURNS = path.join(
  ASSETS,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
);

function probe(label, s) {
  const keys = [
    "sticky-chat-v46:gs-guard",
    "sticky-chat-v46:extras-tick",
    "sticky-chat-v46:turns-merge",
    "content:[{type:`text`",
    "type:x.role===`user`?`userMessage`:`agentMessage`,text:x.text",
    "r.turn.turnStartedAtMs",
    "!r||!r.turn",
  ];
  console.log("\n==", label, "len", s.length);
  for (const k of keys) {
    if (s.includes(k) || k.includes("r.turn")) console.log(k, s.includes(k) ? s.indexOf(k) : -1);
  }
}

const local = fs.readFileSync(LOCAL, "utf8");
const turns = fs.readFileSync(TURNS, "utf8");
probe("src local", local);
probe("src turns", turns);

// Find all .turn. accesses near risky patterns in local
const re = /[^a-zA-Z0-9_]([a-zA-Z_$][\w$]*)\.turn\./g;
const counts = new Map();
let m;
while ((m = re.exec(local))) {
  counts.set(m[1], (counts.get(m[1]) || 0) + 1);
}
console.log("\n.turn. var counts in local (top):");
[...counts.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .forEach(([k, v]) => console.log(v, k));

// Extract live asar local file if possible
const live = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
);
const tmp = path.join(ROOT, "out/_probe-live-v46");
try {
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp, { recursive: true });
  execFileSync(
    "npx",
    ["asar", "extract", live, tmp],
    { cwd: ROOT, stdio: "ignore" },
  );
  const liveLocal = fs.readFileSync(
    path.join(tmp, "webview/assets/local-conversation-thread-Bnxyo76e.js"),
    "utf8",
  );
  probe("LIVE local", liveLocal);
  console.log(
    "live==src local?",
    liveLocal === local,
    "live has gs-guard?",
    liveLocal.includes("sticky-chat-v46:gs-guard"),
  );
} catch (e) {
  console.log("live extract failed", e.message);
}
