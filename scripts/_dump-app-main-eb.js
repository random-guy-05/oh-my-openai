#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const main = fs.readFileSync(path.join(ASSETS, "app-main-CBwHZrMR.js"), "utf8");
console.log(main.slice(0, 2500));
console.log("\n==== around ErrorBoundary ====");
const i = main.indexOf("fallback:(0,K.jsx)(re,{})");
console.log(main.slice(Math.max(0, i - 500), i + 400));

// Find j import
const m = main.match(/import\{([^}]+)\}from"\.\/[^"]*jj50pjos[^"]*"/);
console.log("\njj50 import", m && m[1].slice(0, 500));
// all imports mentioning Error or Boundary
for (const mm of main.matchAll(/import\{([^}]+)\}from"([^"]+)"/g)) {
  if (/Error|Boundary|Suspense|fallback/i.test(mm[1] + mm[2]) || mm[1].includes(" as j") || /(^|,)j as |(^|,)j,/.test(mm[1].replace(/\s/g, ""))) {
    console.log("IMP", mm[2].slice(-60), mm[1].slice(0, 200));
  }
}
