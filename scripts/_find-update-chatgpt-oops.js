#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const asar = require("@electron/asar");
const os = require("os");

const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const needles = [
  "Update ChatGPT",
  "updateChatGPT",
  "codex.errorBoundary",
  "Try again",
];

for (const f of fs.readdirSync(ASSETS)) {
  if (!f.endsWith(".js")) continue;
  if (/^[a-z]{2}(-[A-Z0-9]+)?-/.test(f) && !f.includes("~")) continue;
  const p = path.join(ASSETS, f);
  if (fs.statSync(p).size > 3_000_000) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("Update ChatGPT") && !s.includes("updateChatGPT")) continue;
  console.log("FILE", f);
  let i = s.indexOf("Update ChatGPT");
  if (i < 0) i = s.indexOf("updateChatGPT");
  console.log(s.slice(Math.max(0, i - 250), i + 400));
}

// Live asar too
const root =
  os.homedir() +
  "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
for (const f of asar.listPackage(root).filter((x) => x.endsWith(".js") && x.includes("webview"))) {
  if (f.split("/").pop().length < 12) continue;
  let s;
  try {
    s = asar.extractFile(root, f.replace(/^\//, "")).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("Update ChatGPT")) continue;
  console.log("\nLIVE", f);
  const i = s.indexOf("Update ChatGPT");
  console.log(s.slice(Math.max(0, i - 300), i + 500));
}
