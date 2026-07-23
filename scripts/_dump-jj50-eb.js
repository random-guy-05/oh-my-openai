#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const f = fs.readdirSync(ASSETS).find((x) => x.includes("jj50pjos") && x.endsWith(".js"));
const src = fs.readFileSync(path.join(ASSETS, f), "utf8");
// find export t as - look at export block for what `t` is
const exp = src.lastIndexOf("export{");
console.log("exports tail", src.slice(exp, exp + 800));

// Search Error boundary class/component patterns
for (const p of [
  "fallback",
  "componentDidCatch",
  "getDerivedStateFromError",
  "Oops",
  "hasError",
  "this.state.error",
]) {
  let i = 0,
    n = 0;
  console.log("\n====", p);
  while ((i = src.indexOf(p, i)) >= 0 && n < 4) {
    console.log(src.slice(Math.max(0, i - 100), i + 200).replace(/\n/g, " "));
    i += p.length;
    n++;
  }
}
