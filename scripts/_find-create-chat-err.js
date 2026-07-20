#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");

const needles = [
  "Error creating",
  "error creating",
  "Creating chat",
  "creating chat",
  "Failed to create",
  "failed to create",
  "Could not create",
  "create chat",
  "Create conversation",
  "createConversation",
  "startConversation",
  "new conversation",
];

for (const f of fs.readdirSync(assets)) {
  if (!f.endsWith(".js")) continue;
  const p = path.join(assets, f);
  const st = fs.statSync(p);
  if (st.size > 15_000_000) continue;
  const s = fs.readFileSync(p, "utf8");
  for (const n of needles) {
    let i = 0,
      c = 0;
    while ((i = s.indexOf(n, i)) >= 0 && c < 3) {
      console.log(f.slice(0, 55), JSON.stringify(n), i, JSON.stringify(s.slice(i - 40, i + 100)).slice(0, 180));
      i += n.length;
      c++;
    }
  }
}
