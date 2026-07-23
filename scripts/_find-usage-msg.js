#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const needle = "out of Codex and Work";
for (const f of fs.readdirSync(ASSETS)) {
  if (!f.endsWith(".js")) continue;
  if (/^[a-z]{2}(-[A-Z0-9]+)?-/.test(f) && !f.includes("~")) continue;
  const p = path.join(ASSETS, f);
  const st = fs.statSync(p);
  if (st.size > 5_000_000) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes(needle) && !s.includes("rate limit resets") && !s.includes("Youre out of") && !s.includes("You're out of")) continue;
  console.log("FILE", f);
  let i = s.indexOf("You're out of");
  if (i < 0) i = s.indexOf("out of Codex");
  console.log(s.slice(Math.max(0, i - 200), i + 400));
}
