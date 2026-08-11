// _make-dmg.js — regenerate the side-by-side DMG (temp helper)
"use strict";
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const PROJECT_ROOT = path.resolve(__dirname, "..");
const srcFolder = path.join(PROJECT_ROOT, "out", "side-by-side-mac-x64");
const dmgPath = path.join(PROJECT_ROOT, "out", "Codex-side-by-side-mac-x64-26.803.41515.dmg");
fs.rmSync(dmgPath, { force: true });
const logFd = fs.openSync("/tmp/dmg.log", "w");
const child = spawn("/usr/bin/hdiutil",
  ["create", "-volname", "Codex", "-srcfolder", srcFolder, "-ov", "-format", "UDZO", dmgPath],
  { detached: true, stdio: ["ignore", logFd, logFd] });
child.unref();
console.log(`hdiutil started pid ${child.pid}`);
