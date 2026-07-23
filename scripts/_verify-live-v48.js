#!/usr/bin/env node
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const live = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
);
const tmp = path.join(ROOT, "out/_v48-live-check");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execFileSync(
  "npx",
  ["asar", "extract-file", live, "webview/assets/local-conversation-thread-Bnxyo76e.js"],
  { cwd: tmp, stdio: "ignore" },
);
const cand = [
  path.join(tmp, "local-conversation-thread-Bnxyo76e.js"),
  path.join(tmp, "webview/assets/local-conversation-thread-Bnxyo76e.js"),
].find((p) => fs.existsSync(p));
const s = fs.readFileSync(cand, "utf8");
console.log("LIVE size", fs.statSync(live).size, "mtime", fs.statSync(live).mtime.toISOString());
console.log("v48 extras-tick", s.includes("sticky-chat-v48:extras-tick"));
console.log("v47 extras-tick", s.includes("sticky-chat-v47:extras-tick"));
console.log("destructive filter", s.includes("(e.turn||e.type===`gap`||e.turnKey!=null)"));
console.log("empty return base", s.includes("if(!Array.isArray(extras)||!extras.length)return base;"));
const i = s.indexOf("extras-tick");
console.log("snippet", JSON.stringify(s.slice(i, i + 500)));

execFileSync(
  "npx",
  [
    "asar",
    "extract-file",
    live,
    "webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ],
  { cwd: tmp, stdio: "ignore" },
);
const tCand = [
  path.join(tmp, "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js"),
  path.join(
    tmp,
    "webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
].find((p) => fs.existsSync(p));
const t = fs.readFileSync(tCand, "utf8");
console.log("turns v48", t.includes("sticky-chat-v48"));
console.log("turns extras", t.includes("cdr-thread-extras"));
console.log("harden", t.includes("harden-turn-map"));
