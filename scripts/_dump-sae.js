#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js"))),
  "utf8",
);
// all sae occurrences
let i = 0,
  n = 0;
while ((i = page.indexOf("sae", i)) >= 0 && n < 30) {
  const ctx = page.slice(Math.max(0, i - 30), i + 80);
  if (/[^A-Za-z0-9_$]sae[^A-Za-z0-9_$]/.test(page.slice(Math.max(0, i - 1), i + 4))) {
    console.log(i, ctx.replace(/\n/g, " "));
    n++;
  }
  i += 3;
}

// CDRRuntime
i = page.indexOf("CDRRuntime");
console.log("\nCDRRuntime", page.slice(i, i + 800));

// Look at _apply-sticky-chat-v43 for sae
const v43 = fs.readFileSync(path.join(__dirname, "_apply-sticky-chat-v43.js"), "utf8");
const j = v43.indexOf("sae");
console.log("\nv43 sae", v43.slice(Math.max(0, j - 100), j + 500));
