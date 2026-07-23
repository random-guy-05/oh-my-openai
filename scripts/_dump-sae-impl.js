#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("ogh9jurw") && f.endsWith(".js"))),
  "utf8",
);
// find import of sae
const m = page.match(/import\{([^}]*\bsae\b[^}]*)\}from"([^"]+)"/);
console.log("import", m && m[0].slice(0, 300));
console.log("from", m && m[2]);

if (m) {
  const mod = m[2].replace(/^.\//, "");
  const f = fs.readdirSync(ASSETS).find((x) => x.startsWith(mod.replace(/\.js$/, "")) || x.includes(mod.slice(0, 30)));
  // resolve exact
  const target = path.join(ASSETS, path.basename(m[2]));
  console.log("target exists", fs.existsSync(target), target);
  if (fs.existsSync(target)) {
    const src = fs.readFileSync(target, "utf8");
    // sae was yn in export - find yn binding from import `yn as sae`
    const parts = m[1].split(",").map((p) => p.trim());
    const bind = parts.find((p) => p.endsWith(" as sae") || p === "sae");
    console.log("bind", bind);
    const exported = bind.includes(" as ") ? bind.split(" as ")[0] : "sae";
    console.log("exported name", exported);
    // find in export list
    const exp = src.lastIndexOf("export{");
    console.log(src.slice(exp, exp + 500));
    // search function that was exported as yn - look for "as yn" in export - yn is local?
    // import was `yn as sae` so local name in module is yn
    const idx = src.indexOf("function yn");
    const idx2 = src.indexOf("yn=");
    const idx3 = src.indexOf("yn=");
    console.log("function yn", idx, "yn=", idx2);
    // search export yn
    const ynExport = src.match(new RegExp(`(\\w+) as ${exported}`));
    console.log("ynExport match", ynExport);
    if (ynExport) {
      const local = ynExport[1];
      let i = src.indexOf(`function ${local}`);
      if (i < 0) i = src.indexOf(`${local}=`);
      console.log("local def", local, i);
      console.log(src.slice(i, i + 1500));
    }
  }
}
