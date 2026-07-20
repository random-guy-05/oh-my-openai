#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const turns = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);
const extrasKey = turns.indexOf("cdr-thread-extras:`+key");
console.log("extrasKey", extrasKey);
console.log(JSON.stringify(turns.slice(extrasKey - 80, extrasKey + 700)));
const mapStart = turns.indexOf("let mapped=extras.map(", extrasKey);
console.log("mapStart", mapStart);
console.log("has );return", turns.indexOf(");return base.concat(mapped)", mapStart));
console.log("has ;return", turns.indexOf(";return base.concat(mapped)", mapStart));
console.log("has return base", turns.indexOf("return base.concat(mapped)", mapStart));
