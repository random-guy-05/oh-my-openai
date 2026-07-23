#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
// Find importers of ogh9jurw that bind `m`
const files = fs.readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
for (const f of files) {
  const src = fs.readFileSync(path.join(ASSETS, f), "utf8");
  if (!src.includes("ogh9jurw")) continue;
  const re = /import\{([^}]+)\}from"\.\/[^"]*ogh9jurw[^"]*"/g;
  let m;
  while ((m = re.exec(src))) {
    if (!/\bm\b/.test(m[1]) && !/\bas m\b/.test(m[1])) continue;
    // extract m binding
    const parts = m[1].split(",");
    const binds = parts
      .map((p) => p.trim())
      .filter((p) => p === "m" || p.endsWith(" as m") || p.startsWith("m as") || /\bas m$/.test(p));
    if (!binds.length && !/(?:^|,)m(?:as|,|$)/.test(m[1].replace(/\s/g, ""))) continue;
    console.log("\nFILE", f);
    console.log("import binds with m:", binds);
    // find local name for exported m (rP)
    for (const p of parts) {
      const mm = p.trim().match(/^(\w+)\s+as\s+(\w+)$/);
      if (mm && mm[1] === "m") {
        console.log("local", mm[2]);
        const local = mm[2];
        let i = 0,
          n = 0;
        const callRe = new RegExp(`[^A-Za-z0-9_$]${local}[^A-Za-z0-9_$]`, "g");
        while ((i = src.indexOf(local, i)) >= 0 && n < 8) {
          if (src.slice(Math.max(0, i - 1), i + local.length + 1).match(new RegExp(`[^\\w]${local}[^\\w]`))) {
            console.log(src.slice(Math.max(0, i - 80), i + 120).replace(/\n/g, " "));
            n++;
          }
          i += local.length;
        }
      }
    }
  }
}
