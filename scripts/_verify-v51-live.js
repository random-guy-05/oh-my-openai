#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const os = require("os");
const roots = [
  os.homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];
for (const root of roots) {
  console.log("===", root);
  const send = asar
    .listPackage(root)
    .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
    .replace(/^\//, "");
  const page = asar
    .listPackage(root)
    .find((f) => f.includes("ogh9jurw") && f.endsWith(".js"))
    .replace(/^\//, "");
  const s = asar.extractFile(root, send).toString("utf8");
  const p = asar.extractFile(root, page).toString("utf8");
  for (const m of [
    "sticky-chat-v51",
    "synth-turn",
    "return{turn:{id:",
    "sticky-chat-v50",
  ]) {
    console.log(m, s.includes(m));
  }
  console.log("page turn-safe", p.includes("sticky-chat-v51:turn-safe"));
  const i = s.indexOf("synth-turn");
  console.log(s.slice(Math.max(0, i - 40), i + 180));
}
