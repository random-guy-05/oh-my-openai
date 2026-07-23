"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const kg =
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js";
const s = fs.readFileSync(path.join(assets, kg), "utf8");

// Broader submit-failed context
const idx = s.indexOf("[Composer] submit failed");
console.log("submit failed ctx:\n", s.slice(idx - 500, idx + 800));

// Find all .danger(Ho( or Ho({
let i = 0;
while ((i = s.indexOf("Ho(", i)) >= 0) {
  const before = s.slice(Math.max(0, i - 15), i);
  if (!before.includes("function ")) {
    console.log("\nHo call@", i, JSON.stringify(s.slice(i - 250, i + 120)));
  }
  i += 3;
}

// Vo and localTaskError path
for (const n of ["localTaskError", "Vo(", "function Vo", "function Go", "function Ko", "function Wo"]) {
  const j = s.indexOf(n);
  console.log(n, j, j >= 0 ? JSON.stringify(s.slice(j, j + 120)) : "");
}
