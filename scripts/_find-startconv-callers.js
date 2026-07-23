#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

const files = asar.listPackage(root).filter((f) => f.endsWith(".js"));
let hits = 0;
for (const f of files) {
  const rel = f.replace(/^\//, "");
  if (!rel.includes("webview/") && !rel.includes(".vite/")) continue;
  // skip locales
  if (/\/[a-z]{2}(-[A-Z0-9]+)?-[A-Za-z0-9_-]{6,}\.js$/.test(rel) && !rel.includes("~"))
    continue;
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  // Look for imported Nl used as send - hard. Search startConversation / .Nl(
  if (!s.includes("startConversation") && !s.includes(".Nl(") && !/\bNl\(/.test(s))
    continue;

  // Find composer submit that calls manager
  const patterns = [
    "startConversation(",
    ".Nl(",
    "await Nl(",
    "Nl(e,",
    "Nl(t,",
    "Nl(this",
  ];
  let shown = false;
  for (const p of patterns) {
    let i = 0,
      n = 0;
    while ((i = s.indexOf(p, i)) >= 0 && n < 3) {
      if (!shown) {
        console.log("\n====", rel);
        shown = true;
        hits++;
      }
      console.log(p, i);
      console.log(s.slice(Math.max(0, i - 120), i + 250));
      i += p.length;
      n++;
    }
  }
  if (hits > 25) break;
}
console.log("\ndone hits files", hits);
