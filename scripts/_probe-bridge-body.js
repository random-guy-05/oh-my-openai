"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

// Chat mode: does create/open skip local composer or use sticky bridge?
const bridgeFile = fs
  .readdirSync(assets)
  .find((f) => f.includes("business-checkou") || f.includes("notebook-preview-panel~app-main~business"));
// find file with CDRStickyChatSend
let bridgePath = null;
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 15e6) continue;
  const head = fs.readFileSync(p, "utf8");
  if (head.includes("async function CDRStickyChatSend")) {
    bridgePath = p;
    console.log("bridge file", f);
    break;
  }
}
const s = fs.readFileSync(bridgePath, "utf8");
const start = s.indexOf("async function CDRStickyChatSend");
// find end roughly - next async function or var
let end = s.indexOf("\nasync function ", start + 10);
if (end < 0) end = s.indexOf("\nfunction ", start + 50);
if (end < 0) end = start + 3500;
console.log("BRIDGE LEN", end - start);
console.log(s.slice(start, Math.min(end, start + 2800)));

// Call sites of CDRStickyChatSend
console.log("\n==== call sites");
const re = /CDRStickyChatSend\(/g;
let m;
while ((m = re.exec(s))) {
  const before = s.slice(Math.max(0, m.index - 20), m.index);
  if (before.includes("function ")) continue;
  console.log("@", m.index, JSON.stringify(s.slice(m.index - 150, m.index + 80)));
}
