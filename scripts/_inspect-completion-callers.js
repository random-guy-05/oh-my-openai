#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

// Find where startCompletionStream is called (not defined)
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  const st = fs.statSync(p);
  if (st.size > 4e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("startCompletionStream(")) continue;
  if (f.includes("nmo0zeut")) continue; // definition file
  let idx = 0,
    n = 0;
  while ((idx = s.indexOf("startCompletionStream(", idx)) >= 0 && n < 2) {
    console.log("\nCALL", f, "@", idx);
    console.log(s.slice(idx - 150, idx + 500));
    idx += 20;
    n++;
  }
}

// Also find conversation request builders
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 4e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (s.includes("action:`next`") && s.includes("messages:") && s.includes("model:")) {
    const i = s.indexOf("action:`next`");
    console.log("\nNEXT", f, "@", i);
    console.log(s.slice(Math.max(0, i - 200), i + 400));
  }
}
