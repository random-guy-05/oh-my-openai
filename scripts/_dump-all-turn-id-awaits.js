#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
const re =
  /(?:await\s+(?:Ml|Nl|oD)\s*\([^;]{0,400}?\)|\(await\s+(?:Ml|Nl|oD)\s*\([^)]*\)\))(?:\s*\?\.)?\.turn/g;

let total = 0;
for (const f of files) {
  const s = fs.readFileSync(path.join(ASSETS, f), "utf8");
  let m;
  re.lastIndex = 0;
  while ((m = re.exec(s))) {
    total++;
    console.log("\n====", f.slice(0, 70), "@", m.index);
    console.log(s.slice(Math.max(0, m.index - 80), m.index + 220));
  }
}
console.log("\nTOTAL", total);

// Broader: any ) .turn.id after await within 200 chars
console.log("\n==== broader .turn.id after await ====");
let n = 0;
for (const f of files) {
  const s = fs.readFileSync(path.join(ASSETS, f), "utf8");
  let i = 0;
  while ((i = s.indexOf(".turn.id", i)) >= 0 && n < 40) {
    const ctx = s.slice(Math.max(0, i - 200), i + 80);
    if (/await\s+(?:Ml|Nl|oD)/.test(ctx) || /Ml\(|Nl\(|oD\(/.test(ctx)) {
      console.log("\n", f.slice(0, 60));
      console.log(ctx);
      n++;
    }
    i += 8;
  }
}

// Also y.turn.id / n.turn.id patterns near create/send
console.log("\n==== createConversation / sendUserMessage paths ====");
for (const f of files) {
  if (!/ogh9jurw|kgjrczv7|Bnxyo76e|oxnpxkxc/.test(f)) continue;
  const s = fs.readFileSync(path.join(ASSETS, f), "utf8");
  for (const needle of ["y.turn.id", "n.turn.id", "r.turn.id", "a.turn.id", "c.turn.id"]) {
    let i = 0,
      c = 0;
    while ((i = s.indexOf(needle, i)) >= 0 && c < 3) {
      const ctx = s.slice(Math.max(0, i - 150), i + 60);
      if (/await|create|send|queue|follow|steer|composer/i.test(ctx)) {
        console.log("\n", f.slice(0, 40), needle);
        console.log(ctx);
      }
      i += needle.length;
      c++;
    }
  }
}
