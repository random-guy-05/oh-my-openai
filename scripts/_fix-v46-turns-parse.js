#!/usr/bin/env node
"use strict";
const fs = require("fs");
const acorn = require("acorn");
const TURNS =
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js";
const src = fs.readFileSync(TURNS, "utf8");
const start = src.indexOf("/* codex-rebuild:sticky-chat-v43:turns-merge */");
console.log("marker", start);
console.log(src.slice(start, start + 900));

const mapStart = src.indexOf("let mapped=extras.map(", start);
const mapEnd = src.indexOf(");return base.concat(mapped)", mapStart);
console.log("\nmapStart", mapStart, "mapEnd", mapEnd);
console.log("OLD MAP:", src.slice(mapStart, mapEnd + 1));

const MARKER = "codex-rebuild:sticky-chat-v46";
const newMap =
  "let mapped=extras.map((x,i)=>{" +
  "let isUser=x.role===`user`;" +
  "let item=isUser" +
  "?{id:`cdr-extra-item-`+i,type:`userMessage`,content:[{type:`text`,text:String(x.text||``),text_elements:[]}]}" +
  ":{id:`cdr-extra-item-`+i,type:`agentMessage`,text:String(x.text||``)};" +
  "return{id:`cdr-extra-`+i+`-`+(x.ts||i),status:`completed`,turnStartedAtMs:x.ts||Date.now(),items:[item],cdrSource:x.source||`chat`}" +
  "})/* " +
  MARKER +
  ":turns-merge */";

console.log("\nNEW MAP:", newMap);

// Simulate: replace from mapStart to mapEnd (exclusive of `);return`)
// OLD code did: out.slice(0, mapStart) + newMap + out.slice(mapEnd);
// mapEnd points at `);return` so we DROP the `)` that closed .map( !!!
// That's the bug — newMap already ends with `})` but we need `)` from original
// Original: let mapped=extras.map(...);
// mapEnd = index of `);return` — the `)` closes map(
// newMap ends with `})/* marker */` — the `}` closes arrow, `)` closes map(
// So we should slice from mapEnd+1 to skip only the old `)`, or include nothing...

// Actually old: map(...);return
// mapEnd at `);return` 
// If newMap = `let mapped=extras.map((x,i)=>{...})/*m*/`
// Then we need: newMap + `;return base.concat...`
// So slice from mapEnd+1 which is `;return base.concat(mapped)` 

let out = src.slice(0, mapStart) + newMap + out.slice(mapEnd + 1);
// wait mapEnd+1 skips `)` leaving `;return` — good if newMap ends with `)`

console.log("\njoined around:", out.slice(mapStart, mapStart + newMap.length + 40));

try {
  acorn.parse(out, { ecmaVersion: "latest", sourceType: "module" });
  console.log("PARSE OK with mapEnd+1");
} catch (e) {
  console.log("FAIL mapEnd+1", e.message);
}

out = src.slice(0, mapStart) + newMap + src.slice(mapEnd);
try {
  acorn.parse(out, { ecmaVersion: "latest", sourceType: "module" });
  console.log("PARSE OK with mapEnd (keeps old ) )");
} catch (e) {
  console.log("FAIL mapEnd", e.message);
  const m = /\((\d+):(\d+)\)/.exec(e.message);
  if (m) {
    // line 2 col
    const lines = out.split("\n");
    const line = lines[Number(m[1]) - 1] || "";
    const col = Number(m[2]);
    console.log(JSON.stringify(line.slice(Math.max(0, col - 60), col + 60)));
  }
}
