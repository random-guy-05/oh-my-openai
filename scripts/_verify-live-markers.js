#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");

const LIVE = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

const NEEDLES = [
  "sticky-chat-v51:synth-turn",
  "sticky-chat-v51:bridge-fn",
  "sticky-chat-v51:turn-safe",
  "sticky-chat-v52:sticky-safe",
  "sticky-chat-v52:extras-wrap",
  "sticky-chat-v52:gs-try",
  "sticky-chat-v49:harden-CC",
  "sticky-chat-v49:harden-D-map",
  "sticky-chat-v49:turns-fa-safe",
  "sticky-chat-v49:extras-tick",
  "cdr-last-error",
  "return{turn:{id:",
];

function check(root) {
  console.log("\n===", root, fs.existsSync(root));
  if (!fs.existsSync(root)) return;
  const files = asar
    .listPackage(root)
    .filter(
      (f) =>
        (f.includes("oxnpxkxc") ||
          f.includes("ogh9jurw") ||
          f.includes("Bnxyo76e") ||
          f.includes("bzu8y8ld") ||
          f.includes("jj50pjos") ||
          f.includes("CBwHZrMR")) &&
        f.endsWith(".js"),
    );
  const blobs = {};
  for (const f of files) {
    const rel = f.replace(/^\//, "");
    const name = path.basename(rel);
    blobs[name] = asar.extractFile(root, rel).toString("utf8");
  }
  const all = Object.values(blobs).join("\n");
  for (const n of NEEDLES) {
    const hit = Object.entries(blobs)
      .filter(([, s]) => s.includes(n))
      .map(([k]) => k.slice(0, 40));
    console.log(n, all.includes(n) ? "YES " + hit.join(",") : "NO");
  }
  // Hook snippet
  for (const [name, s] of Object.entries(blobs)) {
    const h = s.indexOf("if(await CDRStickyChatSend");
    if (h >= 0) {
      console.log("\nhook in", name.slice(0, 50));
      console.log(s.slice(h, h + 450));
    }
  }
}

for (const root of LIVE) check(root);

// Also src
const SRC = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
console.log("\n=== SRC ===");
const files = fs.readdirSync(SRC).filter(
  (f) =>
    (f.includes("oxnpxkxc") ||
      f.includes("ogh9jurw") ||
      f.includes("Bnxyo76e") ||
      f.includes("bzu8y8ld") ||
      f.includes("jj50pjos") ||
      f.includes("CBwHZrMR")) &&
    f.endsWith(".js"),
);
const blobs = {};
for (const f of files) blobs[f] = fs.readFileSync(path.join(SRC, f), "utf8");
const all = Object.values(blobs).join("\n");
for (const n of NEEDLES) {
  console.log(n, all.includes(n) ? "YES" : "NO");
}
