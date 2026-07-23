#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const fs = require("fs");
const roots = process.argv.slice(2);
for (const root of roots) {
  console.log("===", root, fs.existsSync(root));
  if (!fs.existsSync(root)) continue;
  const files = asar
    .listPackage(root)
    .filter((f) => f.includes("oxnpxkxc") && f.endsWith(".js"));
  for (const f of files) {
    const rel = f.replace(/^\//, "");
    const s = asar.extractFile(root, rel).toString("utf8");
    for (const m of [
      "sticky-chat-v50",
      "sticky-chat-v49",
      "sticky-chat-v45",
      "CDRStickyChatSend",
      "guard-turn-start",
      "CDRChatMode",
    ]) {
      console.log(m, s.includes(m));
    }
    const i = s.indexOf("async function CDRStickyChatSend");
    console.log("bridge idx", i);
    if (i >= 0) {
      const chunk = s.slice(i, i + 2800);
      console.log("---BRIDGE HEAD---");
      console.log(chunk.slice(0, 900));
      console.log("---BRIDGE TAIL---");
      console.log(chunk.slice(-700));
      const h = s.indexOf("if(await CDRStickyChatSend");
      console.log("hook", s.slice(h, h + 90));
      const g = s.indexOf("guard-turn-start");
      console.log("guard ctx", s.slice(Math.max(0, g - 120), g + 220));
      // Count unguarded n.turn.id near turn/start
      const turnStart = s.indexOf("`turn/start`");
      console.log(
        "turn/start vicinity",
        s.slice(Math.max(0, turnStart - 100), turnStart + 400),
      );
    }
    // Find oD start and first 500 chars after bridge hook
    const od = s.indexOf("async function oD(e,t,n){");
    console.log("oD idx", od);
    if (od >= 0) console.log("oD head", s.slice(od, od + 600));
  }
}
