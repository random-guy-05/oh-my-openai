#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

// Force --check path: load apply script but intercept writes
const applyPath = path.join(__dirname, "_apply-sticky-chat-v46-turn-fix.js");
let src = fs.readFileSync(applyPath, "utf8");

// Rewrite verify-before-write flow to also print parse context on failure
// Instead, manually replicate patches by requiring after patching process.exit

const LOCAL =
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js";
const TURNS =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js";
const SEND =
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js";

// Eval patch functions from apply script via Function - too heavy.
// Spawn node -c style: run apply with monkeypatched writeFileSync
const Module = require("module");
const writes = [];
const origWrite = fs.writeFileSync;
fs.writeFileSync = function (p, data, ...rest) {
  if (String(p).includes("_asar") || String(p).includes("webview")) {
    writes.push(p);
    try {
      acorn.parse(String(data), { ecmaVersion: "latest", sourceType: "module" });
      console.log("OK write", path.basename(String(p)), String(data).length);
    } catch (e) {
      console.error("BAD write", path.basename(String(p)), e.message);
      const m = /\((\d+):(\d+)\)/.exec(e.message);
      if (m) {
        const lines = String(data).split("\n");
        const line = lines[Number(m[1]) - 1] || String(data);
        const col = Number(m[2]);
        console.error(JSON.stringify(line.slice(Math.max(0, col - 80), col + 80)));
      }
      process.exit(1);
    }
    return; // do not write during dry run
  }
  return origWrite.call(fs, p, data, ...rest);
};

// Prevent install/resign/kill side effects
const { execFileSync, execSync } = require("child_process");
require("child_process").execSync = () => "";
require("child_process").execFileSync = () => "";

process.argv.push("--check");
require("./_apply-sticky-chat-v46-turn-fix.js");
console.log("dry-run complete, files that would write:", writes.map((p) => path.basename(p)));
