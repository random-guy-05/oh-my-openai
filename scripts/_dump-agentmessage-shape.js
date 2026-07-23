#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

// Search across key assets for agentMessage property access patterns
const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
const patterns = [
  /e\.type===`agentMessage`[^;]{0,200}/g,
  /n\.type===`agentMessage`[^;]{0,200}/g,
  /case`agentMessage`[^;]{0,300}/g,
  /type===`agentMessage`&&[^;]{0,150}/g,
];

let count = 0;
for (const f of files) {
  if (f.length > 80 && !/Bnxyo76e|bzu8y8ld|oxnpxkxc|emmhcg7r|k4644ppc|f5p8e1kp|kmcnquzv/.test(f))
    continue;
  const s = fs.readFileSync(path.join(ASSETS, f), "utf8");
  for (const re of patterns) {
    re.lastIndex = 0;
    let m;
    let n = 0;
    while ((m = re.exec(s)) && n < 3) {
      console.log("\n", f.slice(0, 60), "\n", m[0].slice(0, 280));
      n++;
      count++;
      if (count > 40) process.exit(0);
    }
  }
}

// Specifically look for .text on agent message items in render paths
console.log("\n\n==== agentMessage text access ====");
count = 0;
for (const f of files) {
  if (!/Bnxyo76e|emmhcg7r|k4644ppc|conversation|turn|message/.test(f)) continue;
  const s = fs.readFileSync(path.join(ASSETS, f), "utf8");
  let i = 0;
  while ((i = s.indexOf("agentMessage", i)) >= 0 && count < 25) {
    const ctx = s.slice(Math.max(0, i - 40), i + 120);
    if (/\.text|content|phase|markdown/.test(ctx)) {
      console.log(f.slice(0, 50), ctx);
      count++;
    }
    i += 12;
  }
}
