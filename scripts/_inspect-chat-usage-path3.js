#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const PAGE = path.join(
  assets,
  "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);
const SETTINGS = path.join(
  assets,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const BIG = path.join(
  assets,
  "app-initial~avatarOverlayCompositionSurface~app-main~pet-install-modal-host~quick-chat-wind~oieh6gbs-Cqdhv7ms.js",
);

const page = fs.readFileSync(PAGE, "utf8");
const settings = fs.readFileSync(SETTINGS, "utf8");
const big = fs.readFileSync(BIG, "utf8");

// Find mode controller with setMode
const idx = page.indexOf("local-canonical-selector-v3");
console.log("selector context len hunt");
// Find function with onModeSelect and CDRRuntime.setMode
const sm = page.indexOf("CDRRuntime.setMode");
console.log("setMode at", sm);
console.log(page.slice(Math.max(0, sm - 400), sm + 600));

const sm2 = page.indexOf("u=e=>{let CDRNext=CDRRuntime.setMode");
console.log("\ncontroller", sm2, page.slice(sm2, sm2 + 800));

// collaborationForMode / composer
const cmp = settings.indexOf("local-canonical-composer-v5");
console.log("\ncomposer", cmp, settings.slice(cmp, cmp + 500));

// How chatgpt models flow to picker in big file - find models:Oe or useQuery chatgpt
const m = big.indexOf("chatgpt-models");
console.log("\nbig chatgpt-models", m, big.slice(Math.max(0, m - 200), m + 400));

// Find selectedLabel rendering / options map
let i = 0,
  c = 0;
while (c < 6) {
  i = big.indexOf("selectedLabel", i);
  if (i < 0) break;
  console.log("\nselectedLabel", c, big.slice(Math.max(0, i - 60), i + 200).replace(/\n/g, " "));
  i += 12;
  c++;
}

// Find home composer conversationOrigin default
i = 0;
c = 0;
while (c < 10) {
  i = big.indexOf("conversationOrigin:", i);
  if (i < 0) break;
  const sn = big.slice(i, i + 120);
  if (/null|tpp|void 0|CDR|mode/.test(sn)) console.log("origin interesting", sn);
  i += 20;
  c++;
}
