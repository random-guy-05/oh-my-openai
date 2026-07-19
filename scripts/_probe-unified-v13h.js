#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync(
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current/src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
  "utf8",
);
const head = s.slice(0, 100000);
const aw = head.match(/([A-Za-z0-9_$]+) as Aw[,}]/);
const qx = head.match(/([A-Za-z0-9_$]+) as qx[,}]/);
console.log("Aw", aw?.[0], "qx", qx?.[0]);
console.log("Aw( count", s.split("Aw(").length - 1);
console.log("qx() count", s.split("qx()").length - 1);
// third arg at sidebar is i=qx()
const z = s.indexOf("z=({target:t})=>{if(t.source===`chatgpt`)");
console.log(s.slice(z - 400, z + 100));
