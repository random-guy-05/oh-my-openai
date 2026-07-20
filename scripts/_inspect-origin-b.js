#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);
const i = page.indexOf("N=r===`chat`&&v==null?`auto-single-line`:`multiline`,P=b?`tpp`:null");
console.log(page.slice(i - 800, i + 600));
