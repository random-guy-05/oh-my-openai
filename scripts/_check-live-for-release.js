#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const live = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app",
);
const asar = path.join(live, "Contents/Resources/app.asar");
console.log("live exists", fs.existsSync(live), fs.existsSync(asar));
console.log("asar size", fs.statSync(asar).size);
console.log("pkg version", JSON.parse(fs.readFileSync("package.json", "utf8")).version);

function plutil(key) {
  return execFileSync(
    "/usr/bin/plutil",
    ["-extract", key, "raw", path.join(live, "Contents/Info.plist")],
    { encoding: "utf8" },
  ).trim();
}
console.log("CFBundleShortVersionString", plutil("CFBundleShortVersionString"));
console.log("CFBundleVersion", plutil("CFBundleVersion"));
console.log("CFBundleIdentifier", plutil("CFBundleIdentifier"));

try {
  execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", live], {
    stdio: "pipe",
  });
  console.log("codesign ok");
} catch (e) {
  console.log("codesign FAIL", (e.stderr || e.message || "").toString().slice(0, 300));
}

// quick marker check via asar list + extract one file is heavy; use npx asar extract-file
const tmp = path.join("out", "_release-marker-check");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execFileSync(
  "npx",
  ["asar", "extract-file", asar, "webview/assets/local-conversation-thread-Bnxyo76e.js"],
  { cwd: tmp, stdio: "inherit" },
);
const localPath = path.join(tmp, "local-conversation-thread-Bnxyo76e.js");
const alt = path.join(tmp, "webview/assets/local-conversation-thread-Bnxyo76e.js");
const s = fs.readFileSync(fs.existsSync(localPath) ? localPath : alt, "utf8");
console.log("v47 extras-tick", s.includes("sticky-chat-v47:extras-tick"));
console.log("bad filter", s.includes("filter(e=>!e||!e.cdrSource)"));
