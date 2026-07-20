#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const applyPath = path.join(__dirname, "_apply-sticky-chat-v45.js");
const src = fs.readFileSync(applyPath, "utf8");
const MARKER = "codex-rebuild:sticky-chat-v45";
const start = src.indexOf("const NEW_BRIDGE = (");
const end = src.indexOf("\n);", start);
const next = src.indexOf("\nfunction patchSend", end);
if (start < 0 || end < 0 || next < 0) throw new Error("bounds");
const expr = src.slice(start + "const NEW_BRIDGE = ".length, end + 2);
const bridge = new Function("MARKER", "return (" + expr + ");")(MARKER);
console.log("len", bridge.length, "has //", /\n|\/\//.test(bridge));
acorn.parse(bridge, { ecmaVersion: "latest", sourceType: "script" });
console.log("bridge OK");

const SEND = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
);
let send = fs.readFileSync(SEND, "utf8");
function extractFn(s, needle) {
  const a = s.indexOf(needle);
  let d = 0,
    st = false;
  for (let i = a; i < s.length; i++) {
    if (s[i] === "{") {
      d++;
      st = true;
    } else if (s[i] === "}") {
      d--;
      if (st && d === 0) return { start: a, end: i + 1 };
    }
  }
  throw new Error("unclosed");
}
const old = extractFn(send, "async function CDRStickyChatSend(e,t,n){");
send = send.slice(0, old.start) + bridge + send.slice(old.end);
acorn.parse(send, { ecmaVersion: "latest", sourceType: "module" });
console.log("send OK");
