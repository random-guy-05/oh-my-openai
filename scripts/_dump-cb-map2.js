#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const settings = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("unq8yzli") && f.endsWith(".js"))),
  "utf8",
);

const i = settings.indexOf("formatMessage(Cb[t])");
console.log("==== formatMessage(Cb[t]) vicinity ====");
console.log(settings.slice(i - 800, i + 200));

// Find where Cb is defined - look backwards for Cb=
let j = i;
while (j > 0 && j > i - 50000) {
  const slice = settings.slice(j - 20, j + 5);
  if (slice.includes("Cb={") || /[^a-zA-Z]Cb=e/.test(slice) || slice.includes("var Cb,")) {
    console.log("\n==== possible Cb def near ====", j);
    console.log(settings.slice(j - 50, j + 600));
    break;
  }
  j--;
}

// Broader: composer.reasoningEffort message ids
for (const needle of [
  "composer.reasoningEffort",
  "reasoningEffort.none",
  "id:`composer.intelligence",
  "function Ab(",
  "Ab=(",
  "U=ne",
  "supportedReasoningEfforts",
  "showReasoningEffortControls:j",
  "showReasoningEffortControls:",
]) {
  let idx = 0,
    n = 0;
  console.log("\n====", needle, "====");
  while ((idx = settings.indexOf(needle, idx)) >= 0 && n < 4) {
    console.log(settings.slice(Math.max(0, idx - 60), idx + 350));
    console.log("---");
    idx += needle.length;
    n++;
  }
}

// Find message descriptor object that maps effort -> {id, defaultMessage}
const re = /none:\s*\{id:`[^`]+`/g;
let m;
n = 0;
console.log("\n==== none:{id patterns ====");
while ((m = re.exec(settings)) && n < 5) {
  console.log(settings.slice(m.index - 40, m.index + 400));
  console.log("---");
  n++;
}
