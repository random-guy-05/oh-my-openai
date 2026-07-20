#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = "src/mac-x64/_asar/webview/assets";
const files = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));

for (const f of files) {
  const s = fs.readFileSync(path.join(assets, f), "utf8");
  if (!s.includes("export{") || s.length > 5_000_000) continue;
  const exp = s.slice(s.lastIndexOf("export{"));
  if (/\byn as |\bas yn\b|,yn,|,yn}|yn}/.test(exp) || /function yn\(/.test(s) || /,yn=/.test(s)) {
    // check for nextMode in same file - likely product mode switcher
    if (s.includes("nextMode") || s.includes("startNewConversation")) {
      console.log("HIT", f, "len", s.length, "nextMode", s.includes("nextMode"));
      const i = s.indexOf("nextMode");
      if (i >= 0) console.log(s.slice(Math.max(0, i - 150), i + 800));
    }
  }
}

// Also search for function that takes nextMode destructure
for (const f of files) {
  const s = fs.readFileSync(path.join(assets, f), "utf8");
  if (s.includes("nextMode:") && s.includes("currentMode:") && s.includes("startNewConversation")) {
    console.log("\nFILE", f);
    let i = 0,
      c = 0;
    while (c < 3) {
      i = s.indexOf("nextMode", i);
      if (i < 0) break;
      // find function start before this
      const start = s.lastIndexOf("function ", i);
      console.log(s.slice(Math.max(start, i - 200), i + 600));
      i += 8;
      c++;
    }
  }
}
