"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const kg =
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js";
const s = fs.readFileSync(path.join(assets, kg), "utf8");

// Bo call sites
const re = /\bBo\(/g;
let m;
console.log("==== Bo calls");
while ((m = re.exec(s))) {
  const before = s.slice(Math.max(0, m.index - 12), m.index);
  if (before.includes("function ")) {
    console.log("DEF", m.index);
    continue;
  }
  console.log("@", m.index, JSON.stringify(s.slice(m.index - 180, m.index + 100)));
}

// composerMode values near local
for (const n of ["composerMode:`local`", "composerMode:`cloud`", "composerMode:`worktree`", 'composerMode:"local"', "mode:`local`"]) {
  console.log(n, s.split(n).length - 1);
}

// Search toast id passed to danger(Ho
const idx = s.indexOf("Ho({error:e,composerMode:r,intl:o})");
console.log("\ntoast id context", JSON.stringify(s.slice(idx - 50, idx + 80)));
// Look for .danger(Ho or callers that pass id
let i = 0;
while ((i = s.indexOf("composer.taskError", i)) >= 0) {
  console.log("taskError@", i, JSON.stringify(s.slice(i - 80, i + 60)));
  i += 10;
}
