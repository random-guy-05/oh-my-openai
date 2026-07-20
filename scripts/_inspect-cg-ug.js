#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const settings = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  ),
  "utf8",
);

function extractFn(src, name) {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error("missing " + name);
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed " + name);
}

for (const name of ["Cg", "Ug", "Ve", "xg", "Ab"]) {
  try {
    const fn = extractFn(settings, name);
    console.log("\n====", name, "len", fn.length, "====");
    console.log(fn.slice(0, 900));
  } catch (e) {
    console.log(name, e.message);
  }
}

// Find turns get in local with broader context
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const needle = "turns:_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).conversationTurns";
const i = local.indexOf(needle);
console.log("\nturns anchor", i);
console.log(local.slice(i - 200, i + needle.length + 100));

// Also search conversationTurns assignment patterns
let idx = 0,
  n = 0;
while ((idx = local.indexOf("conversationTurns", idx)) >= 0 && n < 15) {
  console.log(n, idx, local.slice(idx - 40, idx + 80).replace(/\n/g, " "));
  idx += 18;
  n++;
}
