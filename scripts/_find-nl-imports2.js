#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

const files = asar.listPackage(root).filter((f) => f.endsWith(".js") && f.includes("webview/assets"));

for (const f of files) {
  const rel = f.replace(/^\//, "");
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("oxnpxkxc")) continue;

  // Match full import from oxnpxkxc (may be huge)
  const re = /import\{([^}]+)\}from"(\.\/[^"]*oxnpxkxc[^"]*)"/g;
  let m;
  while ((m = re.exec(s))) {
    const clause = m[1];
    if (!/(?:^|,)Nl(?:as|,|$)/.test(clause.replace(/\s/g, "")) && !/\bNl\b/.test(clause))
      continue;
    // Find Nl as X or bare Nl
    const bindings = [];
    for (const part of clause.split(",")) {
      const p = part.trim();
      if (!p) continue;
      if (p === "Nl") bindings.push({ local: "Nl", exported: "Nl" });
      else {
        const mm = p.match(/^(\w+)\s+as\s+(\w+)$/);
        if (mm && (mm[1] === "Nl" || mm[2] === "Nl")) {
          // Nl as Foo OR Foo as Nl (re-export weird)
          if (mm[1] === "Nl") bindings.push({ local: mm[2], exported: "Nl" });
        }
      }
    }
    if (bindings.length === 0) continue;
    console.log("\n====", rel);
    console.log("bindings", bindings);
    for (const b of bindings) {
      const name = b.local;
      const callRe = new RegExp(`(?<![A-Za-z0-9_$])${name}\\s*\\(`, "g");
      let c,
        n = 0;
      while ((c = callRe.exec(s)) && n < 10) {
        // skip import line
        if (c.index < m.index + m[0].length && c.index >= m.index) {
          n++;
          continue;
        }
        console.log("\nCALL", name, "@", c.index);
        console.log(s.slice(Math.max(0, c.index - 150), c.index + 400));
        n++;
      }
    }
  }
}
