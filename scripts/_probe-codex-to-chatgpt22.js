#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);

function dump(src, needle, after = 400) {
  const i = src.indexOf(needle);
  console.log("\n====", needle, i);
  if (i >= 0) console.log(src.slice(i, i + after));
}

dump(page, "function bE(", 300);
dump(page, "bE=e=>", 200);
dump(page, "bE=t=>", 200);
dump(page, "CE=e=>", 200);
dump(page, "function CE(", 300);

// mt/mn/S imported into remote - find from imports
const mtImport = remote.match(/([A-Za-z0-9_$]+) as mt[,}]/);
console.log("mt import", mtImport);
// search function definitions that parse thread keys like local:
dump(remote, "kind:`local`", 500);
dump(remote, "threadId:", 300);

// Find S( path builder - exported?
const sExport = remote.match(/([A-Za-z0-9_$]+) as S[,}]/);
// S is used in Tc as r(S(t)) - find nearby
dump(remote, "function Tc(", 200);

// Look for Do path in page - was `/local/${`
dump(page, "Do=e=>`/local/", 100);
dump(page, "`/local/${e}`", 100);

// Title helper ml(
dump(page, "function ml(", 400);
dump(remote, "function ml(", 400);
