#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
// Search for navigation to local thread
const needles = [
  "local-thread",
  "client-local-thread",
  "/local/",
  "openThread",
  "selectThread",
  "setActiveThread",
];
for (const f of fs.readdirSync(ASSETS)) {
  if (!f.endsWith(".js")) continue;
  if (f.length < 20) continue;
  if (/^[a-z]{2}(-|$)/.test(f) && !f.includes("~")) continue;
  const p = path.join(ASSETS, f);
  if (fs.statSync(p).size > 2_000_000) continue;
  let s;
  try {
    s = fs.readFileSync(p, "utf8");
  } catch {
    continue;
  }
  if (!s.includes("local-thread") && !s.includes("/local/")) continue;
  for (const n of needles) {
    if (!s.includes(n)) continue;
    let i = 0,
      c = 0;
    while ((i = s.indexOf(n, i)) >= 0 && c < 2) {
      if (n === "/local/" && s.slice(i, i + 20).includes("localStorage")) {
        i += n.length;
        continue;
      }
      console.log("\n", f.slice(0, 60), n, i);
      console.log(s.slice(Math.max(0, i - 80), i + 160).replace(/\n/g, " "));
      i += n.length;
      c++;
    }
  }
}
