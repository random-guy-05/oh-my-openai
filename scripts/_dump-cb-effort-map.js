#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

// Cb message map for efforts
for (const n of ["Cb={", "var Cb", "Cb=", "function Ab(", "Ab=e", "W=Ab("]) {
  const i = settings.indexOf(n);
  console.log("\n====", n, i, "====");
  if (i >= 0) console.log(settings.slice(i, i + 800));
}

// formatMessage(Cb
let i = 0,
  c = 0;
console.log("\n==== formatMessage(Cb ====");
while ((i = settings.indexOf("formatMessage(Cb", i)) >= 0 && c < 10) {
  console.log(settings.slice(Math.max(0, i - 100), i + 200));
  console.log("---");
  i += 10;
  c++;
}

// U = supported efforts list near picker
const u = settings.indexOf("U=ne?.supportedReasoningEfforts");
console.log("\n==== U efforts ====");
console.log(settings.slice(u - 50, u + 400));

// Also ne=Ug(y) - what Ug returns for our chat models
i = 0;
c = 0;
console.log("\n==== Ug definition search ====");
while ((i = settings.indexOf("Ug", i)) >= 0 && c < 20) {
  const ctx = settings.slice(Math.max(0, i - 10), i + 100);
  if (/function Ug|Ug=e|Ug=\(|,\s*Ug=/.test(ctx)) {
    console.log(ctx);
    console.log("---");
    c++;
  }
  i += 2;
}

// showReasoningEffortControls in chat
const j = settings.indexOf("showReasoningEffortControls");
console.log("\n==== showReasoningEffortControls usages ====");
i = 0;
c = 0;
while ((i = settings.indexOf("showReasoningEffortControls", i)) >= 0 && c < 8) {
  console.log(settings.slice(Math.max(0, i - 80), i + 200));
  console.log("---");
  i += 20;
  c++;
}

// Where formatMessage gets effort title - the A=E.map line full
const am = settings.indexOf("A=E.map(e=>{let{reasoningEffort:t}=e,n=YO(t)");
console.log("\n==== E.map efforts full ====");
console.log(settings.slice(am, am + 500));

// Gg select
const gg = settings.indexOf("function Gg(");
console.log("\n==== Gg ====");
console.log(settings.slice(gg, gg + 400));
