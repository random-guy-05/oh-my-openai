#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const toast = asar
  .extractFile(
    root,
    asar
      .listPackage(root)
      .find((f) => f.includes("kgjrczv7") && f.endsWith(".js"))
      .replace(/^\//, ""),
  )
  .toString("utf8");

// Ho and surrounding submit error handling
const ho = toast.indexOf("function Ho(");
console.log("Ho", ho);
console.log(toast.slice(ho, ho + 800));

const uo = toast.indexOf("function Uo(");
// Go back to find Bo / the dispatcher
const bo = toast.indexOf("function Bo(");
console.log("\nBo", bo);
console.log(toast.slice(bo > 0 ? bo : uo - 500, (bo > 0 ? bo : uo - 500) + 900));

// Search reading 'turn' adjacent - any e.turn without optional
const re = /[^?.\w](\w+)\.turn\b/g;
let m,
  n = 0;
const counts = new Map();
while ((m = re.exec(toast)) && n < 500) {
  counts.set(m[1], (counts.get(m[1]) || 0) + 1);
  n++;
}
console.log("\n.turn base identifiers in kgj:", [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20));

// Find catch that calls Fo/Ho
for (const needle of ["Ho(", "Bo(", "cloudTaskError", "createConversation", "startConversation"]) {
  let i = 0,
    c = 0;
  while ((i = toast.indexOf(needle, i)) >= 0 && c < 8) {
    if (needle.length <= 3 && toast.slice(i - 9, i).includes("function")) {
      i += needle.length;
      continue;
    }
    console.log("\n", needle, i);
    console.log(toast.slice(Math.max(0, i - 180), i + 200));
    i += needle.length;
    c++;
  }
}
