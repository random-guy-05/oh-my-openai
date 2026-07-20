#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const local = fs.readFileSync(
  path.join(__dirname, "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js"),
  "utf8",
);
const needle =
  "turns:_.get(al,{conversationId:e,isBackgroundSubagentsEnabled:l}).conversationTurns";
const i = local.indexOf(needle);
console.log(local.slice(i - 800, i + 500));

// Find Cg via regex on whole settings - maybe unicode or special
const settings = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  ),
  "utf8",
);
const m = settings.match(/function Cg[\s\S]{0,40}/);
console.log("match Cg", m && m[0]);
const m2 = [...settings.matchAll(/Cg\s*=\s*/g)].slice(0, 5);
console.log(
  "Cg=",
  m2.map((x) => settings.slice(x.index, x.index + 80)),
);

// Find where power rows are built - search modelLabel in settings from other patches history
console.log("has CDRChat", settings.includes("CDRChat"));
console.log("has powerSetting", settings.includes("powerSetting"));

// Look at Ug/Cg as minified single letter in export or assignment near Ve filter
const ve = settings.search(/function Ve\(|Ve=e=>|Ve=\(e/);
console.log("Ve search", ve, settings.slice(ve, ve + 300));
