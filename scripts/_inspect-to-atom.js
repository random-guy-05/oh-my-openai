#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const mod = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);

const start = mod.indexOf("to=s(p,({conversationId:e,isBackgroundSubagentsEnabled:t},{get:n})=>{");
console.log("to start", start);
console.log(mod.slice(start, start + 2500));

const exp = mod.slice(mod.lastIndexOf("export{"));
console.log("\nto export", exp.match(/to as [A-Za-z0-9_$]+/));
console.log("k export", exp.match(/[A-Za-z0-9_$]+ as k[,}]/));
