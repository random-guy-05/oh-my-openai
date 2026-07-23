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

// All turn/start sendRequest call sites
let i = 0,
  n = 0;
while ((i = s.indexOf("turn/start", i)) >= 0 && n < 30) {
  const ctx = s.slice(Math.max(0, i - 150), i + 200);
  console.log("\n====", i);
  console.log(ctx);
  i += 10;
  n++;
}

// How is oD exported / attached to prototype?
console.log("\n\n=== oD references beyond defn/calls ===");
i = 0;
n = 0;
while ((i = s.indexOf("oD", i)) >= 0 && n < 80) {
  const ctx = s.slice(Math.max(0, i - 5), i + 8);
  // filter noise
  if (!/[^A-Za-z0-9_$]oD[^A-Za-z0-9_$]/.test(s.slice(Math.max(0, i - 1), i + 3))) {
    i += 2;
    continue;
  }
  const wider = s.slice(Math.max(0, i - 40), i + 60);
  if (
    wider.includes("async function oD") ||
    wider.includes("await oD(") ||
    wider.includes("CDRSticky") ||
    wider.includes("usage-guard")
  ) {
    i += 2;
    continue;
  }
  console.log(i, wider.replace(/\n/g, " "));
  i += 2;
  n++;
}
