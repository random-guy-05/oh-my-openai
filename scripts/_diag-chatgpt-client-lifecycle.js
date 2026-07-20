#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const assets = path.join(__dirname, "../src/mac-x64/_asar/webview/assets");
const bzu = fs
  .readdirSync(assets)
  .find((f) => f.includes("bzu8y8ld") && f.endsWith(".js"));
const bz = fs.readFileSync(path.join(assets, bzu), "utf8");

// Find where client atom is set
for (const n of [
  "startCompletionStream",
  "ConversationClient",
  "new ",
  "set(wt",
  "wt,",
  "chatgptApi",
  "getModelsResponse",
]) {
  let i = 0,
    c = 0;
  while ((i = bz.indexOf(n, i)) >= 0 && c < 3) {
    if (n === "new " && !bz.slice(i, i + 40).includes("Client")) {
      i += 4;
      continue;
    }
    console.log(n, i, bz.slice(i, i + 160).replace(/\n/g, " "));
    i += n.length;
    c++;
  }
}

// Find L atom / client in nmo0zeut exports - chatgpt request client
const chat = fs.readFileSync(
  path.join(
    assets,
    "app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  ),
  "utf8",
);
// Who constructs the client class?
const idx = chat.indexOf("async models(){");
console.log("\nmodels context", chat.slice(idx - 500, idx + 200));

// Find prototype assignment or class for the object with models + startCompletionStream
const sc = chat.indexOf("async startCompletionStream");
// walk back for function/class name
console.log("\nbefore stream method", chat.slice(sc - 800, sc + 80));

// Search for `this.request` constructor
const req = chat.indexOf("this.request=");
console.log("\nthis.request=", chat.slice(req - 200, req + 200));
