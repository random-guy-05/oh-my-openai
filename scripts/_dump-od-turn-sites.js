#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const fs = require("fs");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const files = asar
  .listPackage(root)
  .filter((f) => f.includes("oxnpxkxc") && f.endsWith(".js"));
const rel = files[0].replace(/^\//, "");
const s = asar.extractFile(root, rel).toString("utf8");

function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  if (start < 0) throw new Error("missing " + startNeedle);
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0) return { start, end: i + 1, body: src.slice(start, i + 1) };
    }
  }
  throw new Error("unclosed");
}

const od = extractFn(s, "async function oD(e,t,n){");
const body = od.body;
console.log("oD length", body.length);
// Find bridge call region
const bi = body.indexOf("CDRStickyChatSend");
console.log("--- around bridge ---");
console.log(body.slice(Math.max(0, bi - 300), bi + 800));

// Find all `.turn` accesses in oD that aren't guarded nearby
const turnRe = /\.turn\b/g;
let m;
const sites = [];
while ((m = turnRe.exec(body))) {
  sites.push({ i: m.index, ctx: body.slice(Math.max(0, m.index - 60), m.index + 80) });
}
console.log("\n.turn sites in oD:", sites.length);
for (const x of sites.slice(0, 40)) {
  console.log("---", x.i);
  console.log(x.ctx.replace(/\n/g, " "));
}

// Also dump Fo / cloudTaskError from kgjrczv7 if present
const toastFiles = asar
  .listPackage(root)
  .filter((f) => f.includes("kgjrczv7") || f.includes("cloudTaskError"));
console.log("\ntoast files", toastFiles);
