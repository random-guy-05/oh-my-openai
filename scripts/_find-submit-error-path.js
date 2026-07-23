#!/usr/bin/env node
"use strict";
/**
 * Find submit handlers that catch errors and show Fo/Ho toast.
 * Also find any code that does X.turn where X comes from send/startConversation.
 */
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

const files = asar.listPackage(root).filter((f) => f.endsWith(".js") && f.includes("webview/assets"));

const needles = [
  "Error creating chat",
  "composer.cloudTaskError.v2",
  "startConversation(",
  "sendUserMessage",
  "reading 'turn'", // unlikely
];

// Focus: who calls Ho( or the wrapper around Fo
for (const f of files) {
  const rel = f.replace(/^\//, "");
  // skip locale files (short names like de-DE)
  if (/\/[a-z]{2}(-[A-Z]{2})?-[A-Za-z0-9_-]+\.js$/.test(rel) && !rel.includes("~")) continue;
  if (rel.includes("/am-") || rel.includes("/ar-") || rel.includes("/fa-")) continue;
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("cloudTaskError") && !s.includes("startConversation(") && !s.includes("Ho("))
    continue;
  if (!s.includes("Fo(") && !s.includes("startConversation(")) continue;

  // Look for catch blocks near Fo/Ho
  const interesting = [];
  for (const needle of ["?Fo(", ":Fo(", " Ho(", "(Ho(", "catch(e", "startConversation("]) {
    let i = 0,
      n = 0;
    while ((i = s.indexOf(needle, i)) >= 0 && n < 3) {
      interesting.push({ needle, i });
      i += needle.length;
      n++;
    }
  }
  if (interesting.length === 0) continue;
  if (
    !s.includes("Fo(") &&
    !s.includes("startConversation") &&
    !rel.includes("kgjrczv7")
  )
    continue;

  // Only print files that have both catch and Fo or startConversation
  const hasCatchFo =
    /catch\s*\([^)]*\)\s*\{[^}]{0,400}Fo\(/.test(s) ||
    /catch\s*\([^)]*\)\s*\{[^}]{0,400}Ho\(/.test(s) ||
    s.includes(":Fo(") ||
    s.includes("?Fo(");
  if (!hasCatchFo && !s.includes("await this.startConversation") && !s.includes(".startConversation("))
    continue;

  console.log("\n====", rel, "size", s.length);
  // Dump Ho dispatcher area in kgj
  if (rel.includes("kgjrczv7")) {
    const idx = s.indexOf("t===`cloud`?Io");
    console.log(s.slice(Math.max(0, idx - 400), idx + 300));
    // Find callers of the function containing that
    const fnStart = s.lastIndexOf("function ", idx);
    console.log("\nfn near:", s.slice(fnStart, fnStart + 200));
  }

  // Find `.turn` throws candidates: `xxx.turn` without optional chaining where xxx might be undef
  // specifically after await
  const re = /await[^;]{0,120}\n?[^;]{0,80}\.turn\b/g;
  let m,
    c = 0;
  while ((m = re.exec(s)) && c < 5) {
    console.log("\nAWAIT..TURN", m.index);
    console.log(m[0].slice(0, 250));
    c++;
  }
}
