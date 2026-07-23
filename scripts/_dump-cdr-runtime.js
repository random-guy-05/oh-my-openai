#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const pagePath = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js")),
);
const page = fs.readFileSync(pagePath, "utf8");
const i = page.indexOf("CDRRuntime");
console.log("first CDRRuntime at", i);
// find the install function
const j = page.indexOf("installLocalModeRuntime");
console.log("install at", j);
console.log(page.slice(j - 100, j + 2500));

try {
  acorn.parse(page, { ecmaVersion: "latest", sourceType: "module" });
  console.log("\nPARSE OK");
} catch (e) {
  console.log("\nPARSE FAIL", e.message, e.pos);
  console.log(page.slice(Math.max(0, e.pos - 100), e.pos + 100));
}
