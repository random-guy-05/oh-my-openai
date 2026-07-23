#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const os = require("os");

const ROOT = path.join(__dirname, "..");
const logPath = path.join(ROOT, "out", "_dmg-build.log");
fs.mkdirSync(path.dirname(logPath), { recursive: true });
fs.writeFileSync(logPath, `start ${new Date().toISOString()}\n`);

const runtime = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app",
);
const child = spawn(
  process.execPath,
  [path.join(ROOT, "scripts/build-side-by-side-mac.js"), "--runtime", runtime],
  { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
);

function write(stream, chunk) {
  const text = chunk.toString();
  process[stream].write(text);
  fs.appendFileSync(logPath, text);
}
child.stdout.on("data", (c) => write("stdout", c));
child.stderr.on("data", (c) => write("stderr", c));
child.on("exit", (code, signal) => {
  fs.appendFileSync(
    logPath,
    `\nexit code=${code} signal=${signal} at ${new Date().toISOString()}\n`,
  );
  process.exit(code || (signal ? 1 : 0));
});
