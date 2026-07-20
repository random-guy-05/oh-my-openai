#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~jhj9i1pn-EyBx1hQI.js";
const s = fs.readFileSync(p, "utf8");
const i = s.indexOf("function so(e)");
console.log(s.slice(i, i + 900));
console.log("---");
const j = s.indexOf("function io(");
console.log("io", j, s.slice(j, j + 1400));
console.log("---");
// find Ve definition used inside so
const soBody = s.slice(i, i + 500);
console.log("soBody", soBody);
// search nearby for Ve=
for (const pat of ["function Ve(", ",Ve=", "Ve=e=>", "Ve=t=>", "Ve=function"]) {
  const k = s.indexOf(pat);
  console.log(pat, k, k >= 0 ? s.slice(k, k + 250) : "");
}
// dump uo/po curated lists fully
const uo = s.indexOf("uo=[{id:`gpt-5.6-terra:low`");
console.log("\nCURATED", s.slice(uo, uo + 1800));
