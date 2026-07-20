#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const local = fs.readFileSync(
  path.join(ROOT, "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
console.log("src v47 extras-tick", local.includes("sticky-chat-v47:extras-tick"));
console.log("src bad filter", local.includes("filter(e=>!e||!e.cdrSource)"));
console.log("src good sanitize", local.includes("filter(e=>e&&e.turn)"));

const live = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
);
const tmp = path.join(ROOT, "out/_probe-live-v47");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
// Extract just one file via asar extract-file if available
try {
  execFileSync(
    "npx",
    [
      "asar",
      "extract-file",
      live,
      "webview/assets/local-conversation-thread-Bnxyo76e.js",
    ],
    { cwd: tmp, stdio: "inherit" },
  );
} catch (e) {
  console.log("extract-file failed, full extract");
  execFileSync("npx", ["asar", "extract", live, tmp], {
    cwd: ROOT,
    stdio: "ignore",
  });
}
const candidates = [
  path.join(tmp, "local-conversation-thread-Bnxyo76e.js"),
  path.join(tmp, "webview/assets/local-conversation-thread-Bnxyo76e.js"),
];
const liveLocal = candidates.map((p) => (fs.existsSync(p) ? p : null)).find(Boolean);
if (!liveLocal) {
  console.log("live local missing", fs.readdirSync(tmp).slice(0, 20));
  process.exit(1);
}
const s = fs.readFileSync(liveLocal, "utf8");
console.log("LIVE v47 extras-tick", s.includes("sticky-chat-v47:extras-tick"));
console.log("LIVE bad filter", s.includes("filter(e=>!e||!e.cdrSource)"));
console.log("LIVE good sanitize", s.includes("filter(e=>e&&e.turn)"));
console.log("LIVE==src", s === local);
