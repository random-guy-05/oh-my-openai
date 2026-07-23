#!/usr/bin/env node
"use strict";

const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const source = path.join(root, "out", "app-same-task-chat-v61.asar");
const targets = [
  path.join(os.homedir(), "Library", "Application Support", "CodexDesktop-Rebuild", "Codex.app", "Contents", "Resources", "app.asar"),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

if (!fs.existsSync(source)) throw new Error(`Missing ${source}`);
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backups = [];
for (const target of targets) {
  if (!fs.existsSync(target)) continue;
  const backup = `${target}.bak-pre-v61-${stamp}`;
  fs.copyFileSync(target, backup);
  fs.copyFileSync(source, target);
  const sendFile = asar.listPackage(target).find((name) => name.includes("oxnpxkxc") && name.endsWith(".js"));
  const send = asar.extractFile(target, sendFile.replace(/^\//, "")).toString("utf8");
  if (!send.includes("same-task-chat-v61:bridge")) throw new Error(`v61 marker missing after copying ${target}`);
  backups.push({ target, backup });
  console.log(`installed ${target}`);
}
if (!backups.length) throw new Error("No Codex ASAR targets found");
fs.writeFileSync(path.join(root, "out", "install-v61-backups.json"), JSON.stringify({ stamp, backups }, null, 2));
execFileSync(process.execPath, [path.join(root, "scripts", "_resign-live-runtime.js")], { cwd: root, stdio: "inherit" });
console.log(`backup manifest: ${path.join(root, "out", "install-v61-backups.json")}`);
