#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const PAGE = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js")),
);
const src = fs.readFileSync(PAGE, "utf8");
const oops = src.indexOf("function rP()");
console.log(src.slice(oops, oops + 2000));
console.log("\n==== rP usages ====");
let i = 0,
  n = 0;
while ((i = src.indexOf("rP", i)) >= 0 && n < 30) {
  const ctx = src.slice(Math.max(0, i - 20), i + 40);
  if (/[^A-Za-z0-9_$]rP[^A-Za-z0-9_$]/.test(src.slice(Math.max(0, i - 1), i + 3))) {
    console.log(ctx.replace(/\n/g, " "));
    n++;
  }
  i += 2;
}

// ErrorBoundary patterns
for (const p of ["ErrorBoundary", "errorElement", "createBrowserRouter", "Route", "componentDidCatch", "getDerivedStateFromError"]) {
  console.log(p, src.includes(p), (src.split(p).length - 1));
}
