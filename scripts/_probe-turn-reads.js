#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const local = fs.readFileSync(
  path.join(assets, "local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const turns = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);

function findTurnReads(label, src) {
  // Match identifier.turn (property access), skip comments roughly
  const re = /\b([A-Za-z_$][\w$]*)\.turn\b/g;
  const hits = [];
  let m;
  while ((m = re.exec(src))) {
    const idx = m.index;
    const before = src.slice(Math.max(0, idx - 40), idx);
    const after = src.slice(idx, idx + 60);
    // skip if optional chain ?.turn
    if (before.endsWith("?.")) continue;
    hits.push({ idx, snip: (before + after).replace(/\s+/g, " ") });
  }
  console.log("\n==", label, "unoptional .turn reads:", hits.length);
  // unique snips
  const seen = new Set();
  for (const h of hits) {
    const key = h.snip.slice(-80);
    if (seen.has(key)) continue;
    seen.add(key);
    console.log(h.idx, JSON.stringify(h.snip));
    if (seen.size >= 40) break;
  }
}

findTurnReads("local", local);
findTurnReads("turns", turns);

// Look at Fa / no / ll related
for (const needle of [
  "function Fa(",
  "visibleTurnEntries",
  "function gS(",
  "renderEntries",
  "turnSearchKey",
]) {
  console.log("local", needle, local.indexOf(needle), "turns", turns.indexOf(needle));
}

// Dump gS and callers
const gs = local.indexOf("function gS(");
console.log("\nGS:", local.slice(gs, gs + 350));

// Find usages of gS(
let i = 0,
  n = 0;
while (n < 10) {
  i = local.indexOf("gS(", i);
  if (i < 0) break;
  console.log("gS call@", i, JSON.stringify(local.slice(i - 30, i + 80)));
  i += 3;
  n++;
}

// Check mapped extras shape vs native visibleTurnEntries sample
const tick = local.indexOf("sticky-chat-v46:extras-tick");
console.log("\nEXTRAS:", local.slice(tick, tick + 1100));

// In turns file - Fa processing of conversationTurns
const fa = turns.indexOf("function Fa(");
console.log("\nFa@turns", fa);
if (fa >= 0) console.log(turns.slice(fa, fa + 500));

// Search how entries get .turn assigned in turns bundle
const assign = turns.indexOf(".turn=");
console.log("\n.turn= count-ish");
let j = 0,
  c = 0;
while ((j = turns.indexOf("turn:", j)) >= 0 && c < 15) {
  console.log(j, JSON.stringify(turns.slice(j - 20, j + 80)));
  j += 5;
  c++;
}
