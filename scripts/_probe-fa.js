#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const turns = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);

// Extract Fa and related helpers — find function Fa( through a reasonable window
const fa = turns.indexOf("function Fa(");
console.log("Fa at", fa);
console.log(turns.slice(fa, fa + 2500));
console.log("\n---\n");
// visibleTurnEntries construction
const v = turns.indexOf("visibleTurnEntries:");
console.log("visibleTurnEntries contexts:");
let i = 0,
  n = 0;
while ((i = turns.indexOf("visibleTurnEntries", i)) >= 0 && n < 8) {
  console.log(i, JSON.stringify(turns.slice(i - 30, i + 120)));
  i += 10;
  n++;
}

// no/ll atom
for (const name of ["function no(", "ll=", "al=", "to="]) {
  const j = turns.indexOf(name);
  console.log(name, j);
}
