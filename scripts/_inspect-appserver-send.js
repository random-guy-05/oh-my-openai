#!/usr/bin/env node
"use strict";
const fs = require("fs");
const f =
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js";
const s = fs.readFileSync(f, "utf8");
const i = s.indexOf("beforeSendRequest:r,inheritThreadSettings");
console.log("at", i);
// find function start
const start = s.lastIndexOf("async function ", i);
console.log("fn start", start, s.slice(start, start + 100));
console.log(s.slice(start, i + 900));
