#!/usr/bin/env node
"use strict";
const fs = require("fs");
const chat = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  "utf8",
);
const i = chat.indexOf("placeholderData:or");
console.log(chat.slice(i - 1500, i + 200));

// find ,or= or or={ or var or
for (const pat of [",or=", "or={", "const or=", "var or,", "or=eR", "or={default"]) {
  console.log(pat, chat.indexOf(pat));
}
// search near IL/Hn models parse return options
const j = chat.indexOf("async models(){return Hn");
console.log("\nmodels fn", chat.slice(j, j + 300));
