"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const f =
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js";
const s = fs.readFileSync(path.join(assets, f), "utf8");

// Parent around Fo/Io dispatcher at ~87543
const disp = s.indexOf("t===`cloud`?Io(e,n):Fo(e,n)");
console.log("DISP@", disp);
console.log(s.slice(disp - 900, disp + 200));

// Find function name containing this
const fn = s.lastIndexOf("function ", disp);
console.log("\nENCLOSING FN start:", s.slice(fn, fn + 80));

// Who calls that function? Extract name
const m = /^function\s+([A-Za-z0-9_$]+)/.exec(s.slice(fn));
const name = m && m[1];
console.log("FN NAME", name);
if (name) {
  const re = new RegExp("\\b" + name + "\\(", "g");
  let hit;
  let n = 0;
  while ((hit = re.exec(s)) && n < 30) {
    if (hit.index === fn + "function ".length) {
      // skip - this is wrong, definition is function NAME
    }
    const before = s.slice(Math.max(0, hit.index - 12), hit.index);
    if (before.includes("function ")) {
      console.log("DEF call-skip", hit.index);
      n++;
      continue;
    }
    console.log(
      "CALL@",
      hit.index,
      JSON.stringify(s.slice(Math.max(0, hit.index - 200), hit.index + 100)),
    );
    n++;
  }
}
