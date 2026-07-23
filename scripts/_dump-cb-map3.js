#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

// Find all "Cb[" and nearby defs
const hits = [];
let idx = 0;
while ((idx = settings.indexOf("Cb[", idx)) >= 0) {
  hits.push(idx);
  idx += 3;
}
console.log("Cb[ count", hits.length);
for (const h of hits.slice(0, 8)) {
  console.log("---", h);
  console.log(settings.slice(h - 30, h + 40));
}

// Find ",Cb=" or "Cb={" or "Cb:{" 
for (const n of [",Cb=", ";Cb=", " Cb=", "\nCb=", "Cb={", "Cb:{", "Cb=e((", "var Cb=", "let Cb="]) {
  const i = settings.indexOf(n);
  console.log("needle", JSON.stringify(n), i);
  if (i >= 0) console.log(settings.slice(i, i + 500));
}

// Search for defaultMessage near none/minimal/low/medium as effort labels
const effortMsg = settings.indexOf("defaultMessage:`None`");
console.log("\nNone msg", effortMsg);
if (effortMsg >= 0) console.log(settings.slice(effortMsg - 120, effortMsg + 400));

const med = settings.indexOf("defaultMessage:`Medium`");
console.log("\nMedium msg", med);
if (med >= 0) console.log(settings.slice(med - 150, med + 500));

// Look for object with none: and medium: message descriptors together
const combo = settings.indexOf("none:{id:");
console.log("\nnone:{id:", combo);
if (combo >= 0) console.log(settings.slice(combo - 20, combo + 900));

const combo2 = settings.indexOf("none:{id:`");
console.log("\nnone:{id:`", combo2);
if (combo2 >= 0) console.log(settings.slice(combo2 - 20, combo2 + 900));

// Effort row: E=Cb[q]
const er = settings.indexOf("E=Cb[q]");
console.log("\nE=Cb[q]", er);
console.log(settings.slice(er - 100, er + 250));

// showReasoningEffortControls value computation
const src = settings;
const sre = [];
idx = 0;
while ((idx = src.indexOf("showReasoningEffortControls", idx)) >= 0 && sre.length < 10) {
  sre.push(src.slice(Math.max(0, idx - 100), idx + 120));
  idx += 10;
}
console.log("\n==== showReasoningEffortControls ====");
for (const s of sre) console.log(s, "\n---");

// Ob function - gets efforts for model
const ob = src.indexOf("function Ob(");
console.log("\n==== Ob ====", ob);
console.log(src.slice(ob, ob + 400));

// Ab function  
idx = 0;
let n = 0;
while ((idx = src.indexOf("Ab", idx)) >= 0 && n < 30) {
  const ctx = src.slice(Math.max(0, idx - 8), idx + 60);
  if (/function Ab\(|Ab=e=>|Ab=\(e|[^a-zA-Z]Ab=/.test(ctx)) {
    console.log("Ab hit", ctx);
    console.log(src.slice(idx, idx + 350));
    n++;
  }
  idx += 2;
}
