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

const idx = s.indexOf(
  "await oD(this,O,{clientUserMessageId:o,cwd:ne,",
);
console.log("idx", idx);
console.log(s.slice(idx - 2500, idx + 1200));

// Also find Fo usage in kgjrczv7 related to submit
const toast = asar
  .extractFile(
    root,
    asar
      .listPackage(root)
      .find((f) => f.includes("kgjrczv7") && f.endsWith(".js"))
      .replace(/^\//, ""),
  )
  .toString("utf8");
const fo = toast.indexOf("function Fo(");
console.log("\n\n=== Fo + callers in kgj ===");
console.log(toast.slice(fo, fo + 600));
// Who calls Fo(
let i = 0,
  n = 0;
while ((i = toast.indexOf("Fo(", i)) >= 0 && n < 15) {
  // skip function Fo(
  if (toast.slice(i - 9, i + 3) === "function Fo") {
    i += 3;
    continue;
  }
  console.log("\ncall Fo @", i);
  console.log(toast.slice(Math.max(0, i - 150), i + 120));
  i += 3;
  n++;
}
