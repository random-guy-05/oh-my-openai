#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const f = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const s = fs.readFileSync(f, "utf8");
const i = s.indexOf("H as Cg,");
const start = s.lastIndexOf("import{", i);
// find from — could be from" or from`
let j = i;
while (j < s.length && !(s.startsWith("from", j))) j++;
const fromChunk = s.slice(j, j + 120);
console.log("fromChunk", fromChunk);
const m = fromChunk.match(/from[`"]([^`"]+)[`"]/);
console.log("mod", m && m[1]);

const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const modPath = path.join(assets, m[1].replace("./", ""));
const mod = fs.readFileSync(modPath, "utf8");
console.log("mod size", mod.length, path.basename(modPath));

// H is exported as Cg. Find export { ... H ...
const exp = mod.slice(mod.lastIndexOf("export{"));
// Find which local name maps to H
const hMap = exp.match(/([A-Za-z0-9_$]+) as H[,}]/);
console.log("H maps from", hMap && hMap[1]);
console.log("U maps", exp.match(/([A-Za-z0-9_$]+) as U[,}]/));

const localName = hMap[1];
// Find function definition
for (const pat of [
  `function ${localName}(`,
  `${localName}=e=>`,
  `${localName}=(e`,
  `var ${localName}=`,
  `let ${localName}=`,
  `const ${localName}=`,
]) {
  const idx = mod.indexOf(pat);
  if (idx >= 0) {
    console.log("found", pat, "@", idx);
    console.log(mod.slice(idx, idx + 800));
    break;
  }
}

const uName = exp.match(/([A-Za-z0-9_$]+) as U[,}]/)[1];
for (const pat of [
  `function ${uName}(`,
  `${uName}=e=>`,
  `${uName}=(e`,
  `var ${uName}=`,
  `let ${uName}=`,
]) {
  const idx = mod.indexOf(pat);
  if (idx >= 0) {
    console.log("\nfound Ug src", pat, "@", idx);
    console.log(mod.slice(idx, idx + 800));
    break;
  }
}
