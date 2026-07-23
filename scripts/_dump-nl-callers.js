#!/usr/bin/env node
"use strict";
/**
 * Find who consumes oD/Nl return value — especially `.turn` on the result.
 */
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

const files = asar.listPackage(root).filter((f) => f.endsWith(".js"));
const targets = ["oxnpxkxc", "kgjrczv7", "local-conversation", "Bnxyo76e", "bzu8y8ld"];

function scan(rel, s) {
  // Find export of Nl / oD
  const hits = [];
  for (const needle of [
    "await Nl(",
    "await oD(",
    ".turn.id",
    "Fo(",
    "function Bo(",
    "function Ho(",
  ]) {
    let i = 0,
      n = 0;
    while ((i = s.indexOf(needle, i)) >= 0 && n < 8) {
      hits.push({ needle, i, ctx: s.slice(Math.max(0, i - 120), i + 180) });
      i += needle.length;
      n++;
    }
  }
  return hits;
}

for (const f of files) {
  const rel = f.replace(/^\//, "");
  if (!targets.some((t) => rel.includes(t))) continue;
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  // Focus on await Nl patterns and subsequent .turn
  const re = /await\s+(?:Nl|oD)\s*\([^;]{0,200}/g;
  let m;
  let found = false;
  while ((m = re.exec(s))) {
    if (!found) {
      console.log("\n====", rel);
      found = true;
    }
    console.log("--- call @", m.index);
    console.log(s.slice(m.index, m.index + 500));
  }
}

// Also search ALL js for `await Nl(` 
console.log("\n\n==== GLOBAL await Nl ====");
let count = 0;
for (const f of files) {
  const rel = f.replace(/^\//, "");
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("await Nl(") && !s.includes("=await Nl(")) continue;
  let i = 0;
  while ((i = s.indexOf("await Nl(", i)) >= 0 && count < 20) {
    console.log("\n", rel, i);
    console.log(s.slice(Math.max(0, i - 80), i + 450));
    i += 9;
    count++;
  }
}
