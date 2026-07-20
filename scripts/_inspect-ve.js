#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~jhj9i1pn-EyBx1hQI.js";
const s = fs.readFileSync(p, "utf8");
// Ve usages and import
let i = 0,
  c = 0;
while (c < 20) {
  i = s.indexOf("Ve(", i);
  if (i < 0) break;
  console.log(i, s.slice(Math.max(0, i - 30), i + 80));
  i += 3;
  c++;
}
// import Ve
for (const m of s.matchAll(/import\{([^}]*\bVe\b[^}]*)\}from"\.\/([^"]+)"/g)) {
  console.log("import Ve", m[2], m[1].slice(0, 200));
}
for (const m of s.matchAll(/(\w+) as Ve/g)) {
  console.log("as Ve", m[0], "at", m.index);
}
// Reasoning effort enum
for (const pat of ["xhigh", "`max`", "`none`", "`minimal`", "REASONING", "isReasoningEffort"]) {
  let j = 0,
    d = 0;
  while (d < 4) {
    j = s.indexOf(pat, j);
    if (j < 0) break;
    console.log(pat, j, s.slice(Math.max(0, j - 60), j + 100).replace(/\n/g, " "));
    j += pat.length;
    d++;
  }
}

// How mk uses te - look at advanced vs simple and model row
const settings = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);
const te = settings.indexOf("te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l)");
console.log("\nUI after te:\n", settings.slice(te, te + 2500));
