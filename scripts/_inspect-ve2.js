#!/usr/bin/env node
"use strict";
const fs = require("fs");
const files = fs.readdirSync("src/mac-x64/_asar/webview/assets").filter((f) => f.includes("kw7nl1sl"));
console.log(files);
const s = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + files[0], "utf8");
const exp = s.lastIndexOf("export{");
console.log(s.slice(exp, exp + 800));
// find export x =
for (const pat of ["function x(", ",x=function", ",x=e=>", "x=e=>", "x=t=>", "x=function"]) {
  let i = 0,
    c = 0;
  while (c < 5) {
    i = s.indexOf(pat, i);
    if (i < 0) break;
    console.log(pat, i, s.slice(i, i + 300));
    i += pat.length;
    c++;
  }
}
// search reasoning effort allowlist
for (const pat of ["xhigh", "ultra", "`max`", "minimal", "low`,`medium", "REASONING_EFFORTS", "reasoningEfforts"]) {
  let i = 0,
    c = 0;
  while (c < 6) {
    i = s.indexOf(pat, i);
    if (i < 0) break;
    console.log(pat, i, s.slice(Math.max(0, i - 80), i + 160).replace(/\n/g, " "));
    i += pat.length;
    c++;
  }
}
