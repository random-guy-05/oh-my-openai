#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const fs = require("fs");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const needle = process.argv[3] || "cloudTaskError";
const files = asar.listPackage(root).filter((f) => f.endsWith(".js"));
let hits = 0;
for (const f of files) {
  const rel = f.replace(/^\//, "");
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes(needle)) continue;
  hits++;
  console.log("FILE", rel, "size", s.length);
  let idx = 0;
  let n = 0;
  while ((idx = s.indexOf(needle, idx)) >= 0 && n < 5) {
    console.log("--- hit", n, "at", idx);
    console.log(s.slice(Math.max(0, idx - 200), idx + 350));
    idx += needle.length;
    n++;
  }
}
console.log("files with needle", hits);
