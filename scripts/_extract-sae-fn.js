#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const f = "app-initial~notebook-preview-panel~app-main~pull-request-route~projects-index-page~cloud-en~lpx9dmpy-DIXNZs6h.js";
const src = fs.readFileSync(path.join(ASSETS, f), "utf8");
// export list: find ` as yn` or `yn as`
const exp = src.slice(src.lastIndexOf("export{"));
const m = exp.match(/(\w+) as yn[,}]/);
console.log("export yn from", m && m[1]);
const local = m && m[1];
if (local) {
  // find function
  let idx = src.indexOf(`function ${local}(`);
  if (idx < 0) idx = src.indexOf(`function ${local}{`);
  if (idx < 0) idx = src.indexOf(`${local}=function`);
  if (idx < 0) idx = src.indexOf(`${local}=(e`);
  console.log("idx", idx);
  fs.writeFileSync(
    path.join(__dirname, "..", "out", "sae-fn.txt"),
    src.slice(Math.max(0, idx), idx + 2500),
  );
  console.log("wrote out/sae-fn.txt");
}
