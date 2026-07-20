#!/usr/bin/env node
"use strict";
const fs = require("fs");
const local = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);

// Code that does V.turn / .turn after visibleTurnEntries
const needles = [
  "V=B.at(-1);V!=null&&`turn`in V&&V.turn",
  "B.at(-1)",
  ".turn;",
  "e.turn",
  "tl(i)",
  "function tl(",
];
for (const n of needles) {
  const i = local.indexOf(n);
  console.log(n, i);
  if (i >= 0) console.log(local.slice(i - 40, i + 160), "\n");
}

// Full extras merge block
const tick = local.indexOf("extras-tick");
console.log("\n=== MERGE ===");
console.log(local.slice(tick - 50, tick + 1500));

// turns-merge in bzu
const bzu = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "utf8",
);
const tm = bzu.indexOf("turns-merge");
console.log("\n=== TURNS MERGE ===", tm);
if (tm >= 0) console.log(bzu.slice(tm - 80, tm + 700));

// What does a real visibleTurnEntry look like from Fa/Na
const sample = bzu.indexOf("physicalTurnIds");
console.log("\nphysicalTurnIds", bzu.slice(sample - 100, sample + 250));
