#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const os = require("os");

const cli = path.join(os.homedir(), ".codex", ".codex-global-state.json");
const app = path.join(
  os.homedir(),
  "Library/Application Support/CodexDesktop-Rebuild/CodexHome/.codex-global-state.json",
);
const KEYS = [
  "local-projects",
  "project-order",
  "selected-project",
  "active-workspace-roots",
  "electron-saved-workspace-roots",
  "thread-project-assignments",
  "thread-writable-roots",
  "pinned-thread-ids",
];

const cliState = JSON.parse(fs.readFileSync(cli, "utf8"));
const appState = JSON.parse(fs.readFileSync(app, "utf8"));
fs.copyFileSync(app, `${app}.pre-project-sync-${Date.now()}`);
for (const key of KEYS) {
  if (cliState[key] !== undefined) appState[key] = cliState[key];
}
fs.writeFileSync(app, JSON.stringify(appState));
console.log(
  "synced projects:",
  Object.values(appState["local-projects"] || {}).map((p) => p.name),
);
