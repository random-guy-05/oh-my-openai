#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const f = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const s = fs.readFileSync(f, "utf8");

function find(re, limit = 20) {
  const out = [];
  let m;
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  while ((m = r.exec(s)) && out.length < limit) {
    out.push({ i: m.index, t: s.slice(m.index, m.index + 120).replace(/\n/g, " ") });
  }
  return out;
}

console.log("Cg(y,l)", find(/Cg\(y,l\)/));
console.log("Ug(y)", find(/Ug\(y\)/));
console.log("as Cg", find(/ as Cg[,}]/));
console.log("Cg as", find(/Cg as /));
console.log("Cg=", find(/(?:^|[^A-Za-z0-9_$])Cg=/));
console.log("Ug=", find(/(?:^|[^A-Za-z0-9_$])Ug=/));
console.log("powerSettingIndex", find(/powerSettingIndex/));
console.log("import line with Cg");
const imp = s.match(/import\{[^}]*Cg[^}]*\}from`[^`]+`/);
console.log(imp && imp[0].slice(0, 500));

// Find definition by looking near first Ug( usage that isn't te=
const ugCall = s.indexOf("Ug(");
console.log("first Ug(", ugCall, s.slice(ugCall - 80, ugCall + 80));

// Search for function that returns powerSettingIndex objects
const psi = s.indexOf("powerSettingIndex:");
console.log("psi", psi, psi >= 0 ? s.slice(psi - 200, psi + 200) : "");

// Maybe Cg is inside an IIFE assigned differently — search "curated" or "power"
for (const n of ["curatedModels", "powerModels", "flattenModel", "modelPower"]) {
  console.log(n, s.indexOf(n));
}
