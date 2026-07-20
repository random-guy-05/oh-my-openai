#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const f = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const s = fs.readFileSync(f, "utf8");
const i = s.indexOf(" as Cg,");
// walk back to import{
let start = s.lastIndexOf("import{", i);
let end = s.indexOf(";import{", i);
if (end < 0) end = s.indexOf(";", i);
const stmt = s.slice(start, end + 1);
console.log(stmt.slice(0, 200));
console.log("...");
const from = stmt.match(/from`([^`]+)`/);
console.log("from", from && from[1]);

// Also find Ug import
const iu = s.indexOf(" as Ug,") >= 0 ? s.indexOf(" as Ug,") : s.indexOf(" as Ug}");
console.log("Ug import idx", iu, s.slice(iu - 20, iu + 40));
const startU = s.lastIndexOf("import{", iu);
const stmtU = s.slice(startU, s.indexOf(";", iu) + 1);
const fromU = stmtU.match(/from`([^`]+)`/);
console.log("Ug from", fromU && fromU[1]);
console.log(stmtU.slice(0, 300));

const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const modName = from[1].replace("./", "");
const modPath = path.join(assets, modName);
console.log("mod exists", fs.existsSync(modPath), modPath);
const mod = fs.readFileSync(modPath, "utf8");

// Find export that maps to Cg - need original name before `as Cg`
const aliasPart = stmt.match(/([A-Za-z0-9_$]+) as Cg/);
console.log("Cg original export", aliasPart && aliasPart[1]);
const ugAlias = stmtU.match(/([A-Za-z0-9_$]+) as Ug/);
console.log("Ug original export", ugAlias && ugAlias[1]);

// In module, find function with that export name - look at export{ ... X as Y
const exp = mod.slice(mod.lastIndexOf("export{"));
console.log("exports head", exp.slice(0, 500));

// Search for powerSettingIndex in module
console.log("powerSettingIndex in mod", mod.indexOf("powerSettingIndex"));
const psi = mod.indexOf("powerSettingIndex");
if (psi >= 0) console.log(mod.slice(psi - 300, psi + 200));

// Find curated / flatten helpers by searching reasoningEffort filter max
const maxFilter = mod.indexOf("`max`");
console.log("max", maxFilter, mod.slice(Math.max(0, maxFilter - 100), maxFilter + 100));
