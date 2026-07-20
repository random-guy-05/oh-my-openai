#!/usr/bin/env node
"use strict";
const fs = require("fs");
const settings = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);
// Ob and Ab aliases
for (const m of settings.matchAll(/(\w+) as Ob|(\w+) as Ab|Ob as |Ab as /g)) {
  console.log(m[0], m.index);
}
const exp = settings.indexOf(" as Ob");
console.log("Ob context", settings.slice(exp - 100, exp + 80));
const ab = settings.indexOf(" as Ab");
console.log("Ab context", settings.slice(ab - 100, ab + 80));

// Find Ob import source and definition - usually from same jhj file
const jhj = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~new-thread-panel-page~appgen-library-page~hotkey-window-thread-page~ho~jhj9i1pn-EyBx1hQI.js",
  "utf8",
);
// settings: Ob is imported - check
for (const m of settings.matchAll(/import\{([^}]+)\}from"\.\/([^"]+jhj9i1pn[^"]*)"/g)) {
  const parts = m[1].split(",").filter((p) => /Ob|Ab|Yl|xg|Cg|Ug/.test(p));
  console.log("from jhj", parts);
}

// In settings near U=Ob - what does Ob resolve to from imports at top of mk's module
// Search function that returns supportedReasoningEfforts for a model
const needle = "supportedReasoningEfforts";
let i = 0,
  c = 0;
while (c < 15) {
  i = jhj.indexOf(needle, i);
  if (i < 0) break;
  console.log("\n", i, jhj.slice(Math.max(0, i - 120), i + 200).replace(/\n/g, " "));
  i += needle.length;
  c++;
}
