#!/usr/bin/env node
"use strict";
const fs = require("fs");
const PAGE =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js";
const page = fs.readFileSync(PAGE, "utf8");

// Find import of yn as sae
const imp = page.indexOf("yn as sae");
console.log("import context", page.slice(Math.max(0, imp - 300), imp + 80));
const from = page.lastIndexOf('from"./', imp);
console.log("from", page.slice(from, from + 150));

// Find Ev import
const evImp = page.indexOf(" as Ev") !== -1 ? page.indexOf(" as Ev") : page.indexOf(",Ev,");
console.log("Ev alias search");
for (const m of page.matchAll(/(\w+) as Ev\b|\bEv as (\w+)/g)) {
  console.log(m[0], m.index);
}

// Find startNewConversation function bodies
let i = 0,
  c = 0;
while (c < 8) {
  i = page.indexOf("startNewConversation", i);
  if (i < 0) break;
  console.log("\nSNC", c, page.slice(Math.max(0, i - 80), i + 300).replace(/\n/g, " "));
  i += 20;
  c++;
}

// Find yn in the imported module
const modMatch = page.slice(from, from + 200).match(/from"\.\/([^"]+)"/);
console.log("\nmodule", modMatch && modMatch[1]);
if (modMatch) {
  const mod = fs.readFileSync(
    "src/mac-x64/_asar/webview/assets/" + modMatch[1],
    "utf8",
  );
  const exp = mod.lastIndexOf("export{");
  console.log("exports snip", mod.slice(exp, exp + 800));
  // yn is export - find what letter maps to yn in the import side... wait yn is the export name from the other module
  // Find function yn in mod - actually the import is `yn as sae` meaning the module exports `yn`
  for (const pat of ["function yn(", ",yn=", "yn=function", "yn=(e"]) {
    const j = mod.indexOf(pat);
    console.log(pat, j);
    if (j >= 0) console.log(mod.slice(j, j + 1500));
  }
}
