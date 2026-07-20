#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const PAGE =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js";
const MOD =
  "src/mac-x64/_asar/webview/assets/app-initial~notebook-preview-panel~app-main~pull-request-route~projects-index-page~cloud-en~lpx9dmpy-DIXNZs6h.js";
const BIG =
  "src/mac-x64/_asar/webview/assets/app-initial~avatarOverlayCompositionSurface~app-main~pet-install-modal-host~quick-chat-wind~oieh6gbs-Cqdhv7ms.js";

const page = fs.readFileSync(PAGE, "utf8");
const mod = fs.readFileSync(MOD, "utf8");
const big = fs.readFileSync(BIG, "utf8");

console.log("=== sl / Et ===");
const sl = mod.indexOf("function sl(");
console.log(mod.slice(sl, sl + 700));

// Find At and jt values near Et
for (const pat of ["function Et(", "At=`", "jt=`", "At=\"", ",At=", ",jt="]) {
  let i = 0,
    c = 0;
  while (c < 3) {
    i = mod.indexOf(pat, i);
    if (i < 0) break;
    console.log(pat, i, mod.slice(i, i + 180).replace(/\n/g, " "));
    i += pat.length;
    c++;
  }
}

console.log("\n=== home at / — what element ===");
// Find Route path:/` with surrounding
let i = page.indexOf("path:`/`})");
console.log(page.slice(i - 400, i + 100));

// Find work-home vs chatgpt home
for (const pat of [
  "work-home",
  "WorkHome",
  "ChatHome",
  "CDRChatHome",
  "productMode===`codex`",
  "productMode===`work`",
  "r===`codex`",
  "r===`work`",
]) {
  console.log(pat, page.split(pat).length - 1);
}

console.log("\n=== conversationOrigin derivation in big ===");
// Find where origin is set from product mode / atom
i = 0;
let c = 0;
while (c < 12) {
  i = big.indexOf("conversationOrigin", i);
  if (i < 0) break;
  const sn = big.slice(Math.max(0, i - 100), i + 150);
  if (/tpp|null|product|mode|yl|atom|codex|work/.test(sn)) {
    console.log("---", c, sn.replace(/\n/g, " ").slice(0, 280));
  }
  i += 20;
  c++;
}

// Find atom yl usage for default origin
console.log("\n=== default origin atom ===");
for (const pat of ["conversationOrigin===void 0", "get(yl", "yl,", "origin:`tpp`", "origin:null"]) {
  const j = big.indexOf(pat);
  console.log(pat, j, j >= 0 ? big.slice(Math.max(0, j - 60), j + 160).replace(/\n/g, " ") : "");
}

// page: how productMode r is obtained in mode controller
console.log("\n=== mode controller productMode ===");
const mc = page.indexOf("codexFeaturesAllowed:n,productMode:r");
console.log(page.slice(mc - 100, mc + 400));
