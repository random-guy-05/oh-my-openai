#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const files = asar
  .listPackage(root)
  .filter((f) => f.includes("oxnpxkxc") && f.endsWith(".js"));
const s = asar.extractFile(root, files[0].replace(/^\//, "")).toString("utf8");

function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0)
        return { start, end: i + 1, body: src.slice(start, i + 1) };
    }
  }
  throw new Error("unclosed");
}

const body = extractFn(s, "async function oD(e,t,n){").body;
const turnRe = /\.turn\b/g;
let m;
while ((m = turnRe.exec(body))) {
  console.log("\n==== SITE", m.index, "====");
  console.log(body.slice(Math.max(0, m.index - 150), m.index + 120));
}

// Also find Fo wrapper around oD / Nl
const fo = s.indexOf("function Fo(");
console.log("\nFo idx", fo);
if (fo >= 0) console.log(s.slice(fo, fo + 400));

// Who calls Fo / wraps Nl
for (const needle of ["Fo(Nl", "Fo(oD", "async function Nl", "=Fo(", "cloudTaskError"]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(needle, i)) >= 0 && n < 3) {
    console.log("\nneedle", needle, i);
    console.log(s.slice(Math.max(0, i - 80), i + 200));
    i += needle.length;
    n++;
  }
}

// Search whole asar for reading patterns that throw on undefined.turn outside guard
// Look at M_ and island merge
for (const needle of ["i.turn.turnId", "e.turn.items", "t.turn.id", "map(e=>e.turn)", ".turn)"]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(needle, i)) >= 0 && n < 4) {
    console.log("\nPATTERN", needle, "@", i);
    console.log(s.slice(Math.max(0, i - 100), i + 120).replace(/\n/g, " "));
    i += needle.length;
    n++;
  }
}
