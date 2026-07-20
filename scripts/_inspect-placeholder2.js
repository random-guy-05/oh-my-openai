#!/usr/bin/env node
const fs = require("fs");
const chat = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  "utf8",
);
const i = chat.indexOf(",or={");
console.log(chat.slice(i, i + 900));
