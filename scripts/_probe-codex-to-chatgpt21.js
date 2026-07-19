#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const page = fs.readFileSync(path.join(assets, "app-initial~app-main~page-ClBbNyfy.js"), "utf8");
const settings = fs.readFileSync(
  path.join(
    assets,
    "app-initial~app-main~appgen-settings-page~pull-request-route~onboarding-page~settings-page~~iaab4bzx-BHK3miry.js",
  ),
  "utf8",
);

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);
  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) for (const item of child) if (item?.type) walk(item, visitor);
    else if (child?.type) walk(child, visitor);
  }
}

const ast = parse(page, { ecmaVersion: "latest", sourceType: "module" });
let eAe;
walk(ast, (n) => {
  if (n.type === "FunctionDeclaration" && n.id?.name === "eAe") eAe = n;
});
const body = page.slice(eAe.start, eAe.end);

// Dump where M map is built with source codex / chatgpt
const idx = body.indexOf("new Map");
console.log("=== eAe map building ===");
console.log(body.slice(body.indexOf("let M=new Map"), body.indexOf("let M=new Map") + 2500));

console.log("\n=== click handler area ===");
console.log(body.slice(body.indexOf("z=({target:t})"), body.indexOf("z=({target:t})") + 400));

// sendRequest turn/start context
const ts = settings.indexOf("sendRequest(`turn/start`");
console.log("\n=== turn/start send ===");
console.log(settings.slice(ts - 400, ts + 800));

// mn and S for threadKey -> path (from remote, imported into page as part of Aw)
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);
// Find mn and S near Tc - they might be imports
console.log("\n=== imports used by Tc ===");
// mt function for threadKey parse
for (const name of ["mt", "mn", "S", "Ec"]) {
  const i = remote.indexOf(`function ${name}(`);
  console.log(name, i);
  if (i >= 0) console.log(remote.slice(i, i + 350));
}
