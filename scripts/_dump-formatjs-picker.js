#!/usr/bin/env node
"use strict";
/**
 * Find formatjs / FormattedMessage paths in model picker that throw on missing id
 * when Chat selects a live-catalog model.
 */
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

function dump(label, needle, before = 80, after = 700) {
  const i = settings.indexOf(needle);
  console.log(`\n==== ${label} @${i} ====`);
  if (i < 0) return;
  console.log(settings.slice(Math.max(0, i - before), i + after));
}

// YO formats reasoning effort label
dump("YO fn", "function YO(");
dump("YO=", "YO=e=>");
dump("YO call", "J=YO(W)");

// Ab normalizes effort
dump("Ab fn", "function Ab(");
dump("Ab=", "Ab=(");

// X / FormattedMessage usage near picker
dump("formatMessage id missing patterns", "must be provided");

// How powerSelections render labels
for (const n of [
  "powerSelections",
  "modelLabel",
  "function Lb(",
  "Lb={",
  "ye(t.model",
  "function ye(",
  "setModelAndReasoningEffort",
  "onSelectReasoningEffort",
  "Gg(te",
  "function Gg(",
  "function xg(",
  "showReasoningEffortControls",
]) {
  dump(n, n, 40, 500);
}

// Look for formatMessage with dynamic descriptor (no id)
let i = 0,
  c = 0;
console.log("\n==== formatMessage( dynamic ====");
while ((i = settings.indexOf("formatMessage(", i)) >= 0 && c < 25) {
  const ctx = settings.slice(i, i + 200);
  if (/reasoning|effort|model|intelligence|power|YO|Lb/i.test(ctx) || /formatMessage\(\w\)/.test(ctx)) {
    console.log(ctx);
    console.log("---");
    c++;
  }
  i += 14;
}

// Find YO definition more broadly
i = 0;
c = 0;
console.log("\n==== YO definitions ====");
while ((i = settings.indexOf("YO", i)) >= 0 && c < 15) {
  const ctx = settings.slice(Math.max(0, i - 5), i + 80);
  if (/function YO|YO=|,\s*YO=|YO\(/.test(ctx)) {
    console.log(ctx);
    c++;
  }
  i += 2;
}
