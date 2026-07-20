#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const f = [...fs.readdirSync(assets)].find((x) => x.includes("bzu8y8ld") && x.endsWith(".js"));
const s = fs.readFileSync(path.join(assets, f), "utf8");

// find Yn request builder function containing action:`next`
const i = s.indexOf("action:`next`");
console.log("file", f);
console.log(s.slice(i - 500, i + 800));

// find bi function in debug modal
const dbg = fs.readFileSync(path.join(assets, "debug-modal-X5kv3qKc.js"), "utf8");
const bi = dbg.indexOf("function bi(");
console.log("\n=== bi ===");
console.log(dbg.slice(bi, bi + 600));

// How is ChatGPT client stored / exported from nmo0zeut
const chat = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  ),
  "utf8",
);
const cls = chat.indexOf("startCompletionStream");
// find class or object method attachment
console.log("\n=== around startCompletionStream method ===");
console.log(chat.slice(cls - 300, cls + 200));

// Look for ConversationClient or similar constructor
for (const n of ["class ", "ConversationClient", "ChatgptClient", "function Cn(", "new "]) {
  // skip
}
const exportLine = chat.slice(chat.lastIndexOf("export{"));
console.log("\nexports", exportLine.slice(0, 800));
