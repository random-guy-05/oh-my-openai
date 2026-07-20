#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// Find where homeComposerMode value is assigned - look for mode strings
for (const pat of [
  "homeComposerMode:`",
  "homeComposerMode:e",
  "homeComposerMode:t",
  "homeComposerMode:n",
  "homeComposerMode:r",
  "homeComposerMode:a",
  "homeComposerMode:i",
  "setHomeComposerMode",
  "HomeComposerMode",
  "`agent`",
  "`chatgpt`",
  "composerMode:`chatgpt`",
  "composerMode:`codex`",
]) {
  let i = 0,
    c = 0;
  while (c < 6) {
    i = page.indexOf(pat, i);
    if (i < 0) break;
    console.log(pat, i, page.slice(Math.max(0, i - 50), i + 120).replace(/\n/g, " "));
    i += pat.length;
    c++;
  }
}

// Find HomeComposerModeToggle component file import usage - search for values chatgpt/codex in toggle
const toggle = page.indexOf("HomeComposerModeToggle");
console.log("\ntoggle import area", page.slice(toggle - 200, toggle + 100));

// Search in all assets for homeComposerMode atom
const assets = "src/mac-x64/_asar/webview/assets";
const files = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));
for (const f of files) {
  const s = fs.readFileSync(assets + "/" + f, "utf8");
  if (!s.includes("homeComposerMode") && !s.includes("HomeComposerMode")) continue;
  if (f.includes("ogh9jurw")) continue;
  console.log("\nFILE", f, "len", s.length);
  for (const pat of ["homeComposerMode", "`chatgpt`", "`codex`", "setMode", "composer-mode"]) {
    const j = s.indexOf(pat);
    if (j >= 0) console.log(" ", pat, j, s.slice(Math.max(0, j - 40), j + 100).replace(/\n/g, " "));
  }
}
