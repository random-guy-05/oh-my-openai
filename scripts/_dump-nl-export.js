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

// Find export of Nl
for (const needle of [
  "Nl=oD",
  "oD as Nl",
  "Nl:",
  ",Nl,",
  "Nl=Fo",
  "Fo(oD",
  "Ho(",
  "Bo(",
  "export{",
]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(needle, i)) >= 0 && n < 5) {
    console.log("\n", needle, i);
    console.log(s.slice(Math.max(0, i - 100), i + 250));
    i += needle.length;
    n++;
  }
}

// End of file exports
console.log("\n=== FILE TAIL ===");
console.log(s.slice(-800));

// Search for function that wraps send and uses .turn on result
const re = /(?:const|let|var)\s+(\w+)\s*=\s*await\s+\w+\([^)]*\)[^;]{0,80}\.turn/g;
let m;
while ((m = re.exec(s))) {
  console.log("\nASSIGN.TURN", m.index, m[0].slice(0, 200));
}
