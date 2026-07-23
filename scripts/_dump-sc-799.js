#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const s = asar
  .extractFile(
    root,
    asar
      .listPackage(root)
      .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
      .replace(/^\//, ""),
  )
  .toString("utf8");

const idx = 799685;
console.log(s.slice(idx - 2000, idx + 800));

// Also find ALL .startConversation( call sites
let i = 0,
  n = 0;
while ((i = s.indexOf(".startConversation(", i)) >= 0 && n < 20) {
  console.log("\n==== CALL", i);
  console.log(s.slice(Math.max(0, i - 200), i + 400));
  i += 19;
  n++;
}

// Find threadCreation - maybe follow-ups go through a different path that still hits turn/start via inlined code in another function that was MISSED because it uses template differently
console.log("\n\nturn/steer sites:");
i = 0;
n = 0;
while ((i = s.indexOf("`turn/steer`", i)) >= 0 && n < 10) {
  console.log(s.slice(Math.max(0, i - 100), i + 200));
  i += 12;
  n++;
}
