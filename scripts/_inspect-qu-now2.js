#!/usr/bin/env node
"use strict";
const fs = require("fs");
const settings = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);
const q = settings.indexOf("function QU(");
console.log(settings.slice(q, q + 800));

// Find turn start / send user message in any large settings-related file
const assets = "src/mac-x64/_asar/webview/assets";
for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = assets + "/" + f;
  if (fs.statSync(p).size > 3e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (s.includes("beforeSendRequest") && s.includes("inheritThreadSettings")) {
    console.log("\nSEND", f);
    const i = s.indexOf("beforeSendRequest");
    console.log(s.slice(i - 120, i + 300));
  }
}
