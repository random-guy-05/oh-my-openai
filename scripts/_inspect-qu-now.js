#!/usr/bin/env node
"use strict";
const fs = require("fs");
const settings = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  "utf8",
);
// Find AppServer turn/start send
for (const pat of [
  "async function QU(",
  "turn/start",
  "thread/start",
  "startTurn",
  "function QU(",
  "setModelAndReasoningEffort",
  "registerModelController",
]) {
  console.log(pat, settings.indexOf(pat), settings.split(pat).length - 1);
}

// Find submit path near composer
const i = settings.indexOf("registerModelController");
console.log("\nnear register", settings.slice(i - 200, i + 400));

// Find where user message is sent on local
for (const pat of ["beforeSendRequest", "inheritThreadSettings", "useAppServerPermissionDefault"]) {
  const j = settings.indexOf(pat);
  console.log(pat, j);
  if (j >= 0) console.log(settings.slice(j - 80, j + 200));
}
