"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const f =
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js";
const s = fs.readFileSync(path.join(assets, f), "utf8");

function dumpCalls(name) {
  const re = new RegExp("\\b" + name + "\\(", "g");
  let m;
  let n = 0;
  console.log("====", name, "calls");
  while ((m = re.exec(s)) && n < 60) {
    const before = s.slice(Math.max(0, m.index - 20), m.index);
    if (/function\s+$/.test(before)) {
      console.log("DEF@", m.index);
      n++;
      continue;
    }
    console.log(
      "@",
      m.index,
      JSON.stringify(s.slice(Math.max(0, m.index - 180), m.index + 120)),
    );
    n++;
  }
}
dumpCalls("Fo");
dumpCalls("Io");

for (const n of [
  "cloud?Io:Fo",
  "cloud?Io",
  "?Io:Fo",
  "?Fo:",
  "Fo(e",
  "Io(e",
  "cdr-product-mode",
  "composerMode===`cloud`",
  'composerMode==="cloud"',
]) {
  console.log("count", n, s.split(n).length - 1);
  const idx = s.indexOf(n);
  if (idx >= 0) console.log(" first", JSON.stringify(s.slice(idx - 100, idx + 160)));
}

console.log("==== Fo near create/start/thread");
const reFo = /\bFo\(/g;
let mFo;
let c = 0;
while ((mFo = reFo.exec(s)) && c < 40) {
  const ctx = s.slice(Math.max(0, mFo.index - 400), mFo.index + 80);
  if (/creat|start|thread|local|conversation|catch|toast/i.test(ctx)) {
    console.log("@", mFo.index, JSON.stringify(ctx.slice(-500)));
  }
  c++;
}
