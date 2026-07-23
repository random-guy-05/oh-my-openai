#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");
const LIVE = [
  path.join(os.homedir(), "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];
const NEEDLES = [
  "chat-models-v54:merge",
  "chat-models-v54:helpers",
  "chat-models-v54:load",
  "chat-models-v54:bridge-model",
  "chat-models-v54:picker-layout",
  "__cdrChatPowerRows",
  "__cdrChatDefaultSlug",
  "K=CDRMode===`chat`?!1:",
];
for (const root of LIVE) {
  console.log("\n===", root, fs.existsSync(root));
  if (!fs.existsSync(root)) continue;
  const files = asar.listPackage(root).filter((f) =>
    (f.includes("nmo0zeut") || f.includes("unq8yzli") || f.includes("oxnpxkxc")) && f.endsWith(".js"),
  );
  const all = files.map((f) => asar.extractFile(root, f.replace(/^\//, "")).toString("utf8")).join("\n");
  for (const n of NEEDLES) console.log(n, all.includes(n) ? "YES" : "NO");
  console.log("hardcoded Sol High merge", /selectedLabel:`Sol High`,slug:`gpt-5\.6-sol`/.test(all) && !all.includes("chat-models-v54:merge") ? "BAD" : "cleared-or-ok");
}
