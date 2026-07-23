"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

// Find chat-mode create/open path differences
const needles = [
  "cdr-product-mode",
  "product-mode===`chat`",
  "===`chat`",
  "composerMode",
  "createLocal",
  "startLocal",
  "openLocal",
  "newLocalThread",
  "localConversation",
];

for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  const st = fs.statSync(p);
  if (st.size > 15e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("cdr-product-mode") && !s.includes("composerMode")) continue;

  const hits = [];
  for (const n of needles) {
    const c = s.split(n).length - 1;
    if (c) hits.push([n, c]);
  }
  if (!hits.length) continue;
  if (!s.includes("cdr-product-mode") && !/composerMode.*cloud|cloud.*composerMode/.test(s))
    continue;

  console.log("\nFILE", f.slice(0, 80), "size", st.size);
  console.log(" hits", hits.map(([n, c]) => n + ":" + c).join(", "));

  // dump cdr-product-mode contexts
  let i = 0,
    c = 0;
  while ((i = s.indexOf("cdr-product-mode", i)) >= 0 && c < 8) {
    console.log(" cdr@", i, JSON.stringify(s.slice(i - 60, i + 180)));
    i += 16;
    c++;
  }

  // Fo/Io dispatcher
  for (const pat of ["?Io:Fo", "?Fo:Io", "cloud?Io", "composerMode===`cloud`?Io:Fo", "composerMode===`cloud`?Fo:Io"]) {
    const idx = s.indexOf(pat);
    if (idx >= 0) console.log(" DISP", pat, JSON.stringify(s.slice(idx - 120, idx + 100)));
  }
}
