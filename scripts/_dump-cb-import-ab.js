#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

// Search all assets for Cb effort map and Ab
const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
for (const f of files) {
  if (f.length > 90 && !/unq8yzli|ogh9jurw|oxnpxkxc|nmo0zeut|kgjrczv7|f5p8e1kp|k4644ppc/.test(f))
    continue;
  const s = fs.readFileSync(path.join(ASSETS, f), "utf8");
  if (s.includes("formatMessage(Cb[") || s.includes("X,{...Cb[") || /Cb=\{[^}]*none:/.test(s)) {
    console.log("file", f.slice(0, 70));
  }
  // Look for effort descriptor maps
  if (s.includes("composer.intelligenceDropdown.effort") || s.includes("reasoningEffort.high")) {
    const i = s.indexOf("composer.intelligenceDropdown.effort");
    if (i >= 0) {
      console.log("\n====", f.slice(0, 50), "effort msg ====");
      console.log(s.slice(Math.max(0, i - 200), i + 600));
    }
  }
}

const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

// Import line for Cb
const imp = settings.slice(0, 2500);
console.log("\n==== imports head ====");
console.log(imp);

// Find Ab definition via "function Ab" in any form - maybe minified as Ab=e=>{
const abIdx = settings.search(/function Ab\(|Ab=e=>|Ab=\([e,]|Ab=function/);
console.log("\nAb regex", abIdx);
if (abIdx >= 0) console.log(settings.slice(abIdx, abIdx + 400));

// W=Ab( - find Ab by looking at export or nearby function before first use
const wab = settings.indexOf("W=Ab(");
console.log("\nW=Ab context", settings.slice(wab - 200, wab + 100));

// Search "Ab(e,t)" style function that's effort normalizer
let idx = 0,
  n = 0;
console.log("\n==== Ab(e patterns ====");
while ((idx = settings.indexOf("Ab(", idx)) >= 0 && n < 15) {
  const before = settings.slice(Math.max(0, idx - 30), idx);
  if (/function |=>|=|,|:/.test(before.slice(-5)) || /return |[;=,(]\s*$/.test(before)) {
    console.log(settings.slice(Math.max(0, idx - 40), idx + 200));
    console.log("---");
    n++;
  }
  idx += 3;
}

// Find where j (showReasoningEffortControls) is set in mk
const jSet = settings.indexOf("showReasoningEffortControls:!0");
console.log("\n==== hardcoded showReasoningEffortControls:!0 ====");
console.log(settings.slice(jSet - 400, jSet + 200));
