#!/usr/bin/env node
"use strict";
const fs = require("fs");
const files = fs.readdirSync("src/mac-x64/_asar/webview/assets").filter((f) => f.endsWith(".js"));
for (const f of files) {
  const s = fs.readFileSync("src/mac-x64/_asar/webview/assets/" + f, "utf8");
  if (!s.includes("home-composer-mode-v1")) continue;
  const i = s.indexOf("home-composer-mode-v1");
  console.log("FILE", f);
  console.log(s.slice(Math.max(0, i - 400), i + 800));
}
