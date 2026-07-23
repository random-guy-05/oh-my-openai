#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const source = path.join(ROOT, "out", "app-same-task-chat-v60.asar");
const app = process.env.CDR_TEST_APP || "/tmp/CodexV57Test-20260722.app";
const destination = path.join(app, "Contents", "Resources", "app.asar");
const plist = path.join(app, "Contents", "Info.plist");
const executable = path.join(app, "Contents", "MacOS", "ChatGPT");

function headerHash(file) {
  const data = fs.readFileSync(file);
  const size = data.readUInt32LE(12);
  return crypto.createHash("sha256").update(data.subarray(16, 16 + size)).digest("hex");
}

if (!fs.existsSync(source) || !fs.existsSync(plist)) throw new Error("Missing v60 ASAR or isolated app");
fs.copyFileSync(source, destination);
const hash = headerHash(destination);
const candidates = new Set();
for (const name of fs.readdirSync(path.join(ROOT, "out"))) {
  if (!name.endsWith(".asar")) continue;
  try { candidates.add(headerHash(path.join(ROOT, "out", name))); } catch {}
}
for (const file of [
  path.join(os.homedir(), "Library", "Application Support", "CodexDesktop-Rebuild", "Codex.app", "Contents", "Resources", "app.asar"),
  destination,
]) {
  try { candidates.add(headerHash(file)); } catch {}
}
let executableData = fs.readFileSync(executable);
let patched = 0;
if (executableData.indexOf(Buffer.from(hash, "ascii")) < 0) {
  for (const candidate of candidates) {
    if (candidate === hash) continue;
    const needle = Buffer.from(candidate, "ascii");
    let index = executableData.indexOf(needle);
    while (index >= 0) {
      Buffer.from(hash, "ascii").copy(executableData, index);
      patched++;
      index = executableData.indexOf(needle, index + hash.length);
    }
  }
  if (!patched) throw new Error("Could not find the prior ASAR header hash in the isolated executable");
  fs.writeFileSync(executable, executableData);
}
execFileSync("/usr/bin/plutil", ["-replace", "ElectronAsarIntegrity.Resources/app\\.asar.hash", "-string", hash, plist]);
execFileSync("/usr/bin/plutil", ["-replace", "ElectronAsarIntegrity.Resources/app\\.asar.algorithm", "-string", "SHA256", plist]);
if (!process.env.CDR_SKIP_SIGN) {
  execFileSync("/usr/bin/codesign", ["--force", "--sign", "-", "--timestamp=none", app], { stdio: "inherit" });
  execFileSync("/usr/bin/codesign", ["--verify", "--strict", app], { stdio: "inherit" });
}
console.log(`staged v60 in ${app} (${hash}, executable patches: ${patched})${process.env.CDR_SKIP_SIGN ? " unsigned" : ""}`);
