#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const os = require("os");
const path = require("path");
const fs = require("fs");

const LIVE = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

const NEEDLES = [
  "sticky-chat-v53:extras-safe",
  "sticky-chat-v53:params-cwd",
  "sticky-chat-v53:params-eq",
  "sticky-chat-v53:params-client",
  "sticky-chat-v53:oops-msg",
  "clientUserMessageId:null",
  "renIsTurnShaped",
  "sticky-chat-v51:synth-turn",
  "CDRStickyChatSend",
];

for (const root of LIVE) {
  console.log("\n===", root, fs.existsSync(root));
  if (!fs.existsSync(root)) continue;
  const files = asar
    .listPackage(root)
    .filter(
      (f) =>
        (f.includes("Bnxyo76e") || f.includes("jj50pjos") || f.includes("oxnpxkxc")) &&
        f.endsWith(".js"),
    );
  const blobs = files.map((f) =>
    asar.extractFile(root, f.replace(/^\//, "")).toString("utf8"),
  );
  const all = blobs.join("\n");
  for (const n of NEEDLES) console.log(n, all.includes(n) ? "YES" : "NO");
}
