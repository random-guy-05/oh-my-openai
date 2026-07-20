#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);

// Find function that builds ll atom - imported as k as ll
const ili = local.indexOf(" as ll,") >= 0 ? local.indexOf(" as ll,") : local.indexOf("k as ll");
let j = ili;
while (j < local.length && !local.startsWith("from", j)) j++;
const from = local.slice(j, j + 150).match(/from[`"]([^`"]+)[`"]/);
console.log("ll module", from && from[1]);
const mod = fs.readFileSync(path.join(__dirname, "../src/mac-x64/_asar/webview/assets", from[1].replace("./", "")), "utf8");
const exp = mod.slice(mod.lastIndexOf("export{"));
const kMap = exp.match(/([A-Za-z0-9_$]+) as k[,}]/);
console.log("k from", kMap && kMap[1]);

const name = kMap[1];
// Find atom definition - often atomFamily
for (const pat of [`${name}=`, `function ${name}`, `${name}=e(`, `${name}=t(`]) {
  const i = mod.indexOf(pat);
  if (i >= 0 && i < mod.length - 100) {
    // skip false positives in long strings
  }
}

// Search visibleTurnEntries: in that module
let idx = 0,
  n = 0;
while ((idx = mod.indexOf("visibleTurnEntries", idx)) >= 0 && n < 8) {
  console.log("\n", n, idx, mod.slice(idx - 100, idx + 250).replace(/\n/g, " "));
  idx += 10;
  n++;
}
