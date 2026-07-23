#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

// Search all webview assets for Bo( usage and submit paths that access .turn
const files = asar.listPackage(root).filter((f) => f.endsWith(".js") && f.includes("webview"));

for (const f of files) {
  const rel = f.replace(/^\//, "");
  if (/\/(am|ar|bg|bn|bs|ca|cs|da|de|el|es|et|fa|fi|fr|gu|he|hi|hr|hu|id|it|ja|ka|kk|kn|ko|lt|lv|ml|mr|ms|nb|nl|pa|pl|pt|ro|ru|sk|sl|sr|sv|sw|ta|te|th|tr|uk|ur|vi|zh)/.test(rel))
    continue;
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("Bo(") && !s.includes("onSubmitFailed") && !s.includes("submit failed"))
    continue;
  if (rel.includes("kgjrczv7") && !s.includes("startConversation")) {
    // still check Bo consumers - Bo is defined here; find export
  }

  const has =
    s.includes("onSubmitError") ||
    s.includes("submitFailed") ||
    s.includes("Bo({") ||
    s.includes("=Bo(") ||
    s.includes("Bo(e)") ||
    (s.includes("startConversation") && s.includes(".turn"));

  if (!has && !rel.includes("kgjrczv7")) continue;

  console.log("\n====", rel);
  for (const pat of ["Bo(", "startConversation(", ".turn.id", "await e.start", "await t.start"]) {
    let i = 0,
      n = 0;
    while ((i = s.indexOf(pat, i)) >= 0 && n < 4) {
      const prev = s.slice(Math.max(0, i - 12), i);
      if (pat === "Bo(" && prev.includes("function ")) {
        i += 3;
        continue;
      }
      console.log("\n", pat, i);
      console.log(s.slice(Math.max(0, i - 100), i + 220));
      i += pat.length;
      n++;
    }
  }
}
