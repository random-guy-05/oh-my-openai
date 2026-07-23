#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

// Find Ug Cg - maybe exported differently
for (const n of ["Ug=", "Cg=", "function Ug", "function Cg", "Ug(", "Cg(y"]) {
  let i = 0,
    c = 0;
  console.log("\n====", n, "====");
  while ((i = settings.indexOf(n, i)) >= 0 && c < 3) {
    console.log(settings.slice(Math.max(0, i - 40), i + 200));
    console.log("---");
    i += n.length;
    c++;
  }
}

// Find where te is used in JSX
const teUses = [];
let i = 0;
while ((i = settings.indexOf("te", i)) >= 0 && teUses.length < 30) {
  // too broad
  i++;
}
// better: powerSettingIndex / modelLabel in render
for (const n of [
  "powerSettingIndex",
  "e.modelLabel",
  "t.modelLabel",
  "n.modelLabel",
  "reasoningEffort",
  "data-model-picker-model-row",
  "data-reasoning-slider",
]) {
  i = 0;
  let c = 0;
  console.log("\n====", n, "====");
  while ((i = settings.indexOf(n, i)) >= 0 && c < 4) {
    console.log(settings.slice(Math.max(0, i - 100), i + 180));
    console.log("---");
    i += n.length;
    c++;
  }
}

// Mode subscribe + helpers injection point
const h = settings.indexOf("sticky-chat-v45:helpers");
console.log("\n==== helpers vicinity ====");
console.log(settings.slice(h - 100, h + 1200));

const mode = settings.indexOf("sticky-chat-v43:mode");
console.log("\n==== mode subscribe ====");
console.log(settings.slice(mode - 100, mode + 400));
