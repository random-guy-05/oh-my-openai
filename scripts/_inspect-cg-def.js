#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const settings = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  ),
  "utf8",
);

for (const name of ["Cg", "Ug", "Ve"]) {
  const patterns = [
    `function ${name}(`,
    `function ${name}(e`,
    `,${name}=e=>`,
    `,${name}=(e`,
    `var ${name}=`,
    `let ${name}=`,
    `const ${name}=`,
    `${name}=function`,
    `${name}=(`,
  ];
  for (const p of patterns) {
    const i = settings.indexOf(p);
    if (i >= 0) {
      console.log(name, "via", JSON.stringify(p), "@", i);
      console.log(settings.slice(i, i + 500), "\n");
      break;
    }
  }
}

// From picker-clean context, find what shape te items have via xg usage comments / render
const te = settings.indexOf("te=Cg(y,l)");
console.log("te uses", settings.slice(te, te + 400));

// Find powerSettingIndex which v39 used
console.log("powerSettingIndex", settings.indexOf("powerSettingIndex"));
console.log("modelLabel", settings.indexOf("modelLabel"));

// Sample of how curated list items look in Cg output by reading nearby string
const sample = settings.indexOf("reasoningEffort:`high`");
console.log("sample", settings.slice(sample - 100, sample + 200));
