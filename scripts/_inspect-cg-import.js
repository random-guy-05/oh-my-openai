#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const settingsPath = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const settings = fs.readFileSync(settingsPath, "utf8");

// Find import of Cg
const importMatch = settings.match(/import\{[^}]*\bCg\b[^}]*\}from`([^`]+)`/);
console.log("import Cg", importMatch && importMatch[0].slice(0, 300), importMatch && importMatch[1]);

const allImports = [...settings.matchAll(/import\{([^}]+)\}from`([^`]+)`/g)];
for (const m of allImports) {
  if (/\bCg\b|\bUg\b|\bAb\b|\bxg\b/.test(m[1])) {
    console.log("from", m[2]);
    const parts = m[1].split(",").filter((p) => /\b(Cg|Ug|Ab|xg|Ve)\b/.test(p));
    console.log(" ", parts.join(" | "));
  }
}

const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const needle =
  "turns:_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).conversationTurns";
const i = local.indexOf(needle);
console.log("\n=== turns ctx ===");
console.log(local.slice(i - 900, i + 400));

// modelLabel usage shape
const ml = settings.indexOf("modelLabel");
console.log("\nmodelLabel ctx", settings.slice(ml - 120, ml + 200));
