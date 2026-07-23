#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

const local = asar
  .extractFile(root, "webview/assets/local-conversation-thread-Bnxyo76e.js")
  .toString("utf8");

for (const p of ["onSubmit", "startConversation", "Bo(", ".turn", "submit", "Nl("]) {
  let i = 0,
    n = 0;
  console.log("\n====", p);
  while ((i = local.indexOf(p, i)) >= 0 && n < 5) {
    console.log("---", i);
    console.log(local.slice(Math.max(0, i - 120), i + 300));
    i += p.length;
    n++;
  }
}

// composer chunk
const composerRel = asar
  .listPackage(root)
  .find(
    (f) =>
      f.includes("composer-project-sele") && f.endsWith(".js") && f.includes("kuwa4oig"),
  );
console.log("\ncomposer", composerRel);
if (composerRel) {
  const c = asar.extractFile(root, composerRel.replace(/^\//, "")).toString("utf8");
  for (const p of ["startConversation", "onSubmit", ".turn", "Bo(", "await Nl", "Nl("]) {
    let i = 0,
      n = 0;
    console.log("\n== composer", p, "count", c.split(p).length - 1);
    while ((i = c.indexOf(p, i)) >= 0 && n < 4) {
      console.log(c.slice(Math.max(0, i - 100), i + 280));
      i += p.length;
      n++;
    }
  }
}
