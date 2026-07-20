#!/usr/bin/env node
"use strict";
const fs = require("fs");
const mod = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~notebook-preview-panel~app-main~pull-request-route~projects-index-page~cloud-en~lpx9dmpy-DIXNZs6h.js",
  "utf8",
);
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);

// At = Au, jt = ? from export Au as At - need jt export
const exp = mod.slice(mod.lastIndexOf("export{"));
for (const name of ["At", "jt", "Et"]) {
  const m = exp.match(new RegExp(`(\\w+) as ${name}[,}]`));
  console.log(name, "←", m && m[1]);
}

// Find Au and jt source bindings - product mode values
for (const pat of ["Au=`", "Au=\"", ",Au=", "Au=e", "function Au", "jt=`work`", "jt=`codex`", "Au=`work`", "Au=`codex`"]) {
  const i = mod.indexOf(pat);
  if (i >= 0) console.log(pat, i, mod.slice(i, i + 120));
}

// Search work/codex string assignments near product
let i = 0,
  c = 0;
while (c < 20) {
  i = mod.indexOf("`codex`", i);
  if (i < 0) break;
  const sn = mod.slice(Math.max(0, i - 40), i + 60);
  if (/Au|jt|At|work|product|mode|Et|gd/.test(sn)) console.log("codex ctx", sn);
  i += 7;
  c++;
}

// gd = Et
console.log("\n=== Et/gd ===");
for (const pat of ["function gd(", ",gd=", "gd=function", "gd=(e"]) {
  const j = mod.indexOf(pat);
  console.log(pat, j, j >= 0 ? mod.slice(j, j + 400) : "");
}

// Home composer on / - find pY which renders when authenticated
console.log("\n=== function pY ===");
const py = page.indexOf("function pY");
console.log(page.slice(py, py + 1200));

// How local vs chatgpt thread opens from home submit
for (const pat of [
  "startLocal",
  "startChat",
  "/local/",
  "conversationOrigin",
  "homeComposerMode",
  "HomeComposerMode",
]) {
  console.log(pat, page.split(pat).length - 1);
}
