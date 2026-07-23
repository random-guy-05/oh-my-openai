#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const s = asar
  .extractFile(
    root,
    asar
      .listPackage(root)
      .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
      .replace(/^\//, ""),
  )
  .toString("utf8");

for (const p of ["=oD", "oD.bind", "oD.call", "oD.apply", ":oD", "{oD}", "(oD)", "[oD]"]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(p, i)) >= 0 && n < 10) {
    console.log(p, i, s.slice(Math.max(0, i - 40), i + 50).replace(/\n/g, " "));
    i += p.length;
    n++;
  }
}

// Maybe method is literally named Nl on the class
for (const p of ["async Nl(", "Nl(e,t)", "Nl(t,n)", ".Nl=oD", "Nl=oD"]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(p, i)) >= 0 && n < 5) {
    console.log(p, i, s.slice(Math.max(0, i - 30), i + 80));
    i += p.length;
    n++;
  }
}

// Search for sendRequest with turn/start using different quote styles
for (const p of ['"turn/start"', "'turn/start'", "`turn/start`", "turn/start"]) {
  console.log(p, "count", s.split(p).length - 1);
}

// Who imports Bo as h from kgj and uses it - find composer submit in page bundles
const files = asar.listPackage(root).filter((f) => f.endsWith(".js") && f.includes("webview"));
for (const f of files) {
  const rel = f.replace(/^\//, "");
  if (!rel.includes("local-conversation") && !rel.includes("composer") && !rel.includes("new-thread"))
    continue;
  let src;
  try {
    src = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!src.includes("startConversation") && !src.includes("kgjrczv7")) continue;
  console.log("\nFILE", rel, "has startConversation", src.includes("startConversation"));
  // find import from kgj with Bo as h
  const m = src.match(/import\{([^}]*)\}from"\.\/[^"]*kgjrczv7[^"]*"/);
  if (m && /\bBo\b|\bas h\b/.test(m[1])) {
    console.log("kgj import snippet", m[1].slice(0, 300));
  }
  let i = src.indexOf("startConversation(");
  if (i >= 0) console.log(src.slice(Math.max(0, i - 200), i + 400));
}
