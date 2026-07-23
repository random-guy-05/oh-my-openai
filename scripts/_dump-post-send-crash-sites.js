#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

const page = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js"))),
  "utf8",
);
const i = page.indexOf("sticky-chat-v51:turn-safe");
console.log("==== turn-safe vicinity ====");
console.log(page.slice(Math.max(0, i - 400), i + 800));

// Find all .turn.id after await Ml / Nl
let idx = 0;
let n = 0;
console.log("\n==== .turn.id sites in page ====");
while ((idx = page.indexOf(".turn.id", idx)) >= 0 && n < 12) {
  console.log("---", n, "---");
  console.log(page.slice(Math.max(0, idx - 120), idx + 180));
  idx += 8;
  n++;
}

const local = fs.readFileSync(path.join(ASSETS, "local-conversation-thread-Bnxyo76e.js"), "utf8");
console.log("\n==== extras-wrap full ====");
const ew = local.indexOf("sticky-chat-v52:extras-wrap");
console.log(local.slice(ew, ew + 1800));

// Find item render switch / agentMessage handling in local
idx = 0;
n = 0;
console.log("\n==== agentMessage in local ====");
while ((idx = local.indexOf("agentMessage", idx)) >= 0 && n < 8) {
  console.log(local.slice(Math.max(0, idx - 60), idx + 160));
  idx += 12;
  n++;
}

// Search native item factories in oxnpxkxc
const send = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))),
  "utf8",
);
idx = 0;
n = 0;
console.log("\n==== type:`userMessage` in send ====");
while ((idx = send.indexOf("type:`userMessage`", idx)) >= 0 && n < 6) {
  console.log(send.slice(Math.max(0, idx - 80), idx + 250));
  idx += 10;
  n++;
}
idx = 0;
n = 0;
console.log("\n==== type:`agentMessage` in send ====");
while ((idx = send.indexOf("type:`agentMessage`", idx)) >= 0 && n < 6) {
  console.log(send.slice(Math.max(0, idx - 80), idx + 250));
  idx += 10;
  n++;
}

// jj50 ErrorBoundary componentDidCatch
const jj = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("jj50pjos") && f.endsWith(".js"))),
  "utf8",
);
const cd = jj.indexOf("componentDidCatch");
console.log("\n==== jj50 componentDidCatch ====");
console.log(jj.slice(cd, cd + 600));
const eg = jj.indexOf("Eg=e");
console.log("\n==== Eg / ErrorBoundary class snippet ====");
const eb = jj.indexOf("componentStack");
console.log(jj.slice(Math.max(0, eb - 200), eb + 500));
