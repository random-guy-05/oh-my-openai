#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const needles = [
  "Update ChatGPT",
  "update ChatGPT",
  "Try again",
  "try again",
  "ChatGPT had an error",
  "had an error",
  "Something went wrong",
  "chatgpt.error",
  "ChatGPTError",
  "updateChatgpt",
  "update the app",
];

for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 12e6) continue;
  const s = fs.readFileSync(p, "utf8");
  for (const n of needles) {
    let i = 0,
      c = 0;
    while ((i = s.indexOf(n, i)) >= 0 && c < 2) {
      console.log("\n", f.slice(0, 55), JSON.stringify(n), i);
      console.log(JSON.stringify(s.slice(Math.max(0, i - 100), i + 180)).slice(0, 280));
      i += n.length;
      c++;
    }
  }
}
