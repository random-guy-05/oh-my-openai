#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const support = path.join(os.homedir(), "Library", "Application Support", "CodexDesktop-Rebuild");
const installedLauncher = "/Applications/Codex.app";
const installedRuntime = path.join(support, "Codex.app");
const sourceLauncher = path.join(ROOT, "out", "side-by-side-mac-x64", "Codex.app");
const sourceRuntime = path.join(sourceLauncher, "Contents", "Resources", "Codex.payload");
const stageLauncher = "/Applications/.Codex.verified-stage.app";
const stageRuntime = path.join(support, ".Codex.verified-stage.app");
const expectedAsar = process.argv[2];
const backupRoot = process.argv[3] || path.join(ROOT, "out", "install-backups");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backup = path.join(backupRoot, `pre-install-${stamp}`);

if (!/^[a-f0-9]{64}$/.test(expectedAsar || "")) {
  throw new Error("expected packaged ASAR SHA-256 is required");
}

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const verify = (app) => execFileSync("/usr/bin/codesign", ["--verify", "--deep", "--strict", app], { stdio: "inherit" });
const copy = (from, to) => execFileSync("/usr/bin/ditto", [from, to], { stdio: "inherit" });
const sleep = () => execFileSync("/bin/sleep", ["1"]);

function customPids() {
  const output = execFileSync("/bin/ps", ["ax", "-o", "pid=,command="], { encoding: "utf8" });
  const runtimePrefix = installedRuntime + path.sep;
  const launcherExecutable = path.join(installedLauncher, "Contents", "MacOS", "CodexLauncher");
  return output.split("\n").flatMap((line) => {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (!match) return [];
    const command = match[2];
    return command.startsWith(runtimePrefix) || command === launcherExecutable
      ? [Number(match[1])]
      : [];
  });
}

function stopCustomRuntime() {
  for (const pid of customPids()) {
    try { process.kill(pid, "SIGTERM"); } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
  for (let attempt = 0; attempt < 15; attempt++) {
    if (customPids().length === 0) return;
    sleep();
  }
  throw new Error(`custom runtime did not stop: ${customPids().join(", ")}`);
}

function restoreIfMissing(installed, saved) {
  if (!fs.existsSync(installed) && fs.existsSync(saved)) fs.renameSync(saved, installed);
}

fs.mkdirSync(backupRoot, { recursive: true });
for (const target of [stageLauncher, stageRuntime, backup]) {
  if (fs.existsSync(target)) throw new Error(`refusing to overwrite existing path: ${target}`);
}
if (!fs.existsSync(sourceLauncher) || !fs.existsSync(sourceRuntime)) {
  throw new Error("verified side-by-side build output is missing");
}

copy(sourceLauncher, stageLauncher);
copy(sourceRuntime, stageRuntime);
verify(stageLauncher);
verify(stageRuntime);
const stagedAsar = path.join(stageRuntime, "Contents", "Resources", "app.asar");
if (sha256(stagedAsar) !== expectedAsar) throw new Error("staged runtime ASAR hash mismatch");

stopCustomRuntime();
fs.mkdirSync(backup, { recursive: true });
const savedLauncher = path.join(backup, "Codex-launcher-previous.app");
const savedRuntime = path.join(backup, "Codex-runtime-previous.app");

try {
  fs.renameSync(installedLauncher, savedLauncher);
  fs.renameSync(installedRuntime, savedRuntime);
  fs.renameSync(stageLauncher, installedLauncher);
  fs.renameSync(stageRuntime, installedRuntime);
  verify(installedLauncher);
  verify(installedRuntime);
  const installedAsar = path.join(installedRuntime, "Contents", "Resources", "app.asar");
  if (sha256(installedAsar) !== expectedAsar) throw new Error("installed runtime ASAR hash mismatch");
} catch (error) {
  restoreIfMissing(installedLauncher, savedLauncher);
  restoreIfMissing(installedRuntime, savedRuntime);
  throw error;
}

execFileSync("/usr/bin/open", ["-a", installedLauncher]);
console.log(JSON.stringify({ backup, expectedAsar, installedLauncher, installedRuntime }, null, 2));
