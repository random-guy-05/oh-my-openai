#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

const patterns = [
  /Update ChatGPT/,
  /updateChatGpt/i,
  /update.*ChatGPT/i,
  /errorBoundary\.[a-zA-Z]*[Uu]pdate/,
  /defaultMessage:`Update/,
];

for (const f of fs.readdirSync(ASSETS)) {
  if (!f.endsWith(".js") || f.includes(".map")) continue;
  if (/^[a-z]{2}(-[A-Z0-9]+)?-[A-Za-z0-9_-]+\.js$/.test(f) && !f.includes("~")) continue;
  const p = path.join(ASSETS, f);
  const st = fs.statSync(p);
  if (st.size > 4_000_000 || st.size < 1000) continue;
  const s = fs.readFileSync(p, "utf8");
  let hit = false;
  for (const re of patterns) {
    if (re.test(s)) {
      hit = true;
      break;
    }
  }
  if (!hit && !(s.includes("Oops") && s.includes("Update") && s.includes("errorBoundary"))) continue;
  if (!s.includes("Oops") && !s.includes("Update ChatGPT") && !/Update \$\{/.test(s)) continue;

  // narrower
  if (s.includes("Update ChatGPT") || (s.includes("genericError") && s.includes("Update"))) {
    console.log("HIT", f, st.size);
    const idx = s.includes("Update ChatGPT")
      ? s.indexOf("Update ChatGPT")
      : s.indexOf("genericError");
    console.log(s.slice(Math.max(0, idx - 400), idx + 600));
    console.log("---");
  }
}

// Broader: any defaultMessage with Update near error
for (const f of fs.readdirSync(ASSETS)) {
  if (!f.includes("~") || !f.endsWith(".js")) continue;
  const p = path.join(ASSETS, f);
  if (fs.statSync(p).size > 2_000_000) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("errorBoundary")) continue;
  const re = /errorBoundary\.[^`\"']+/g;
  let m;
  const ids = new Set();
  while ((m = re.exec(s))) ids.add(m[0].slice(0, 80));
  if (ids.size) console.log(f.slice(0, 70), [...ids].slice(0, 15));
}
