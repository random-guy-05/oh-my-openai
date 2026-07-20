#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 5e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("includeTranscriptTurnExtras")) continue;
  console.log("\nFILE", f);
  let idx = 0,
    n = 0;
  while ((idx = s.indexOf("includeTranscriptTurnExtras", idx)) >= 0 && n < 4) {
    console.log(s.slice(idx - 80, idx + 160).replace(/\n/g, " "));
    idx += 20;
    n++;
  }
}

// Also check ll atom in local via import rename
const local = fs.readFileSync(path.join(assets, "local-conversation-thread-Bnxyo76e.js"), "utf8");
const imp = local.match(/import\{[^}]*\bll\b[^}]*\}from[`"]([^`"]+)[`"]/);
console.log("\nll import", imp && imp[0].slice(0, 200), imp && imp[1]);
// find ` as ll`
const ili = local.indexOf(" as ll,") >= 0 ? local.indexOf(" as ll,") : local.indexOf(" as ll}");
console.log("as ll", ili, local.slice(Math.max(0, ili - 30), ili + 40));
const start = local.lastIndexOf("import{", ili);
let j = ili;
while (j < local.length && !local.startsWith("from", j)) j++;
console.log(local.slice(j, j + 100));
