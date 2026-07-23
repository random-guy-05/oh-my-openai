#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const needle = "Error creating chat";
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 20e6) continue;
  const s = fs.readFileSync(p, "utf8");
  let i = 0;
  while ((i = s.indexOf(needle, i)) >= 0) {
    console.log("\nFILE", f);
    console.log(JSON.stringify(s.slice(Math.max(0, i - 200), i + 250)));
    i += needle.length;
  }
}

// Also defaultMessage variants
for (const n of [
  "Error creating chat",
  "errorCreatingChat",
  "creatingChat",
  "createChatError",
  "Failed to create chat",
]) {
  let hits = 0;
  for (const f of fs.readdirSync(assets)) {
    if (!f.endsWith(".js")) continue;
    const p = path.join(assets, f);
    if (fs.statSync(p).size > 20e6) continue;
    const s = fs.readFileSync(p, "utf8");
    if (s.includes(n)) {
      hits++;
      if (hits <= 8) console.log("hit", n, "in", f.slice(0, 60));
    }
  }
}
