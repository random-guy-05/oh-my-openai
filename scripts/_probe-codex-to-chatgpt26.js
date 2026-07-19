#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const quick = fs.readFileSync(path.join(assets, "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js"), "utf8");
const remote = fs.readFileSync(
  path.join(assets, "app-initial~app-main~projects-index-page~remote-conversation-page-as6G4j38.js"),
  "utf8",
);

const kmNeedle = "m=t.conversationOrigin===void 0?e.get(yl,u):t.conversationOrigin";
console.log("km count", quick.split(kmNeedle).length - 1);
const i = quick.indexOf(kmNeedle);
console.log(quick.slice(i, i + 200));

const tc = "function Tc(e,t,n,r){Ec(e,t);let i=mn(t);if(i!=null){n(i);return}r(S(t))}";
console.log("tc count", remote.split(tc).length - 1);

// Also check Lp which had similar origin logic
const lp = "f=n===void 0?e.get(yl,t):n";
console.log("lp-like", quick.split(lp).length - 1);
console.log(quick.slice(quick.indexOf(lp), quick.indexOf(lp) + 180));
