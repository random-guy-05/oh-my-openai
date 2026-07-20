#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);
const mlij = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~avatarOverlayCompositionSurface~artifact-tab-content.electron~notebook-preview-~mlij0y86-BXNJDBeL.js",
  "utf8",
);

// How oe stores values
for (const pat of ["function oe(", ",oe=", "oe=function", "function se(", ",se="]) {
  const i = mlij.indexOf(pat);
  console.log(pat, i, i >= 0 ? mlij.slice(i, i + 250) : "");
}

// page imports from mlij
for (const m of page.matchAll(/import\{([^}]+)\}from"\.\/([^"]*mlij0y86[^"]*)"/g)) {
  console.log("import mlij", m[1].slice(0, 300));
}

// Find o_ import in page - what is o_
for (const m of page.matchAll(/(\w+) as o_/g)) {
  console.log("as o_", m[0], m.index, page.slice(m.index - 100, m.index + 80));
}

// Find Yr import
for (const m of page.matchAll(/(\w+) as Yr/g)) {
  console.log("as Yr", m[0]);
}

// localStorage format for home-composer-mode-v1 - check oe in shared jotai file
const files = fs.readdirSync("src/mac-x64/_asar/webview/assets").filter((f) => f.endsWith(".js"));
for (const f of files) {
  const s = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + f, "utf8");
  if (s.includes("function oe(") && s.includes("localStorage") && s.length < 200000) {
    const i = s.indexOf("function oe(");
    console.log("\noe in", f);
    console.log(s.slice(i, i + 500));
  }
}
