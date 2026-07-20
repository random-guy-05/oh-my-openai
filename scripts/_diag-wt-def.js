#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const bzuName = [...fs.readdirSync(assets)].find(
  (f) => f.includes("bzu8y8ld") && f.endsWith(".js"),
);
const bz = fs.readFileSync(path.join(assets, bzuName), "utf8");

// Find import of wt
const i = bz.indexOf(" as wt,") >= 0 ? bz.indexOf(" as wt,") : bz.indexOf(" as wt}");
console.log("as wt", i, bz.slice(i - 40, i + 40));
let j = i;
while (j < bz.length && !bz.startsWith("from", j)) j++;
const from = bz.slice(j, j + 120).match(/from[`"]([^`"]+)[`"]/);
console.log("wt from", from && from[1]);
const orig = bz.slice(Math.max(0, i - 80), i + 10).match(/([A-Za-z0-9_$]+) as wt/);
console.log("orig name", orig && orig[1]);

const modPath = path.join(assets, from[1].replace("./", ""));
const mod = fs.readFileSync(modPath, "utf8");
const name = orig[1];
console.log("mod", path.basename(modPath), "size", mod.length);

// Find definition of that export
const exp = mod.slice(mod.lastIndexOf("export{"));
const mapped = exp.match(new RegExp(`([A-Za-z0-9_$]+) as ${name}[,}]`));
console.log("mapped from", mapped && mapped[1]);
const local = mapped[1];
for (const p of [
  `${local}=`,
  `function ${local}`,
  `const ${local}`,
  `let ${local}`,
  `var ${local}`,
]) {
  const idx = mod.indexOf(p);
  if (idx >= 0) {
    console.log("def", p, idx);
    console.log(mod.slice(idx, idx + 500));
    break;
  }
}

// Also find where client is created - search new + Client in nmo0zeut and related
const chat = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  ),
  "utf8",
);
// export the class - look for `as` near class extends Ae
const cls = chat.indexOf("class extends Ae{constructor(){super({getAdditionalHeaders:Ai})}");
// Find binding - usually `var Xx=class extends` or `Xx=class`
const before = chat.slice(Math.max(0, cls - 80), cls + 20);
console.log("\nclass bind", before);

// Search for getAdditionalHeaders:Ai instantiation
let idx = 0,
  n = 0;
while ((idx = chat.indexOf("getAdditionalHeaders", idx)) >= 0 && n < 8) {
  console.log("gAH", idx, chat.slice(idx - 60, idx + 80));
  idx += 10;
  n++;
}
