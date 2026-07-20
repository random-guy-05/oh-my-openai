#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const chat = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  ),
  "utf8",
);
const i = chat.indexOf("createCompletionStreamHandlers");
console.log(chat.slice(i, i + 1200));

const bzu = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);
const j = bzu.indexOf("onUpdate:");
console.log("\nonUpdate contexts:");
let idx = 0,
  n = 0;
while ((idx = bzu.indexOf("onUpdate:", idx)) >= 0 && n < 5) {
  console.log(bzu.slice(idx, idx + 200));
  idx += 10;
  n++;
}
