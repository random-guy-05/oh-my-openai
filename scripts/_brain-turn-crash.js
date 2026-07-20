#!/usr/bin/env node
"use strict";
/**
 * Find every site that can throw: Cannot read properties of undefined (reading 'turn')
 * That is: destructure {turn} from undefined, or read x.turn when x is undefined.
 */
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const FILES = [
  "local-conversation-thread-Bnxyo76e.js",
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
];

function findRisky(label, src) {
  const risks = [];
  // Pattern 1: .map(({turn  .filter(({turn  .find(({turn
  const re1 = /\.(map|filter|find|flatMap|some|every|forEach)\(\(\{turn/g;
  let m;
  while ((m = re1.exec(src))) {
    risks.push({
      kind: m[1] + "({turn",
      idx: m.index,
      snip: src.slice(m.index, m.index + 120),
    });
  }
  // Pattern 2: let{turn: / const{turn: / ,{turn:
  const re2 = /(?:let|const|var|,)\s*\{turn[:}]/g;
  while ((m = re2.exec(src))) {
    risks.push({
      kind: "destructure",
      idx: m.index,
      snip: src.slice(Math.max(0, m.index - 40), m.index + 80),
    });
  }
  // Pattern 3: for (... of ...) { let{turn
  const re3 = /for\s*\([^)]+\)\{let\{turn/g;
  while ((m = re3.exec(src))) {
    risks.push({
      kind: "for-destructure",
      idx: m.index,
      snip: src.slice(m.index, m.index + 100),
    });
  }
  console.log("\n====", label, "risks", risks.length);
  for (const r of risks.slice(0, 25)) {
    console.log(r.kind, r.idx, JSON.stringify(r.snip.replace(/\s+/g, " ")));
  }
}

for (const f of FILES) {
  const p = path.join(assets, f);
  if (!fs.existsSync(p)) {
    console.log("missing", f);
    continue;
  }
  findRisky(f.slice(0, 50), fs.readFileSync(p, "utf8"));
}

// Show current v47 extras + turns merge
const local = fs.readFileSync(path.join(assets, FILES[0]), "utf8");
const turns = fs.readFileSync(path.join(assets, FILES[1]), "utf8");
console.log("\n--- markers ---");
for (const k of [
  "sticky-chat-v47",
  "sticky-chat-v46",
  "filter(e=>!e||!e.cdrSource)",
  "filter(e=>e&&e.turn)",
]) {
  console.log(k, local.includes(k) || turns.includes(k));
}

const t = local.indexOf("sticky-chat-v47:extras-tick");
console.log("\nEXTRAS IIFE:\n", local.slice(t - 10, t + 1400));
const u = turns.indexOf("sticky-chat-v47:turns-merge");
console.log("\nTURNS:\n", turns.slice(u - 600, u + 40));
