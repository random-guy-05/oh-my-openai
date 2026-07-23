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
  // Find import clause containing Nl from that chunk
  const re =
    /import\{([^}]{0,2000})\}from"\.\/[^"]*oxnpxkxc[^"]*"/g;
  let m;
  while ((m = re.exec(s))) {
    const clause = m[1];
    if (!/\bNl\b/.test(clause)) continue;
    // extract Nl as Alias
    const aliases = [...clause.matchAll(/(?:(\w+)\s+as\s+)?(Nl)\b|(Nl)\s+as\s+(\w+)/g)];
    console.log("\n====", rel);
    console.log("Nl bindings:", aliases.map((a) => a[0]));
    // Find local alias
    let localName = null;
    for (const a of aliases) {
      if (a[0].includes(" as ") && a[0].startsWith("Nl")) localName = a[4] || a[3];
      else if (a[0].includes(" as ") && a[0].endsWith("Nl")) localName = "Nl";
      else localName = "Nl";
    }
    // Also parse properly: `oD as Nl` exported means importers write `Nl as Foo` or just `Nl`
    const nlAs = clause.match(/\bNl\s+as\s+(\w+)/);
    const plain = /\bNl\b/.test(clause);
    const name = nlAs ? nlAs[1] : "Nl";
    console.log("local name likely:", name);
    // Find calls
    const callRe = new RegExp(`(?<!\\.)\\b${name}\\s*\\(`, "g");
    let c,
      n = 0;
    while ((c = callRe.exec(s)) && n < 8) {
      console.log("call @", c.index);
      console.log(s.slice(Math.max(0, c.index - 100), c.index + 350));
      n++;
    }
  }
}
