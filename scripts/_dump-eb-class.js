#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const f = fs.readdirSync(ASSETS).find((x) => x.includes("jj50pjos") && x.endsWith(".js"));
const src = fs.readFileSync(path.join(ASSETS, f), "utf8");
const i = src.indexOf("Tg=class extends");
console.log(src.slice(i, i + 1800));

// Also find sae in ogh9jurw
const page = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((x) => x.includes("ogh9jurw") && x.endsWith(".js"))),
  "utf8",
);
const j = page.indexOf("function sae");
console.log("\n==== sae ====");
console.log(page.slice(j, j + 1200));
