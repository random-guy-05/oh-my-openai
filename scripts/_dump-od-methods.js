#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";
const s = asar
  .extractFile(
    root,
    asar
      .listPackage(root)
      .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
      .replace(/^\//, ""),
  )
  .toString("utf8");

for (const pat of [
  "oD(this",
  "oD(",
  "=oD,",
  "oD,",
  "sendFollowUp",
  "followUpTurn",
  "sendTurn",
  "async send",
  "startTurn(",
  "steerTurn",
  "`turn/start`",
]) {
  let i = 0,
    n = 0;
  while ((i = s.indexOf(pat, i)) >= 0 && n < 12) {
    // skip the big Rf Set and similar
    const ctx = s.slice(Math.max(0, i - 80), i + 160);
    if (pat === "`turn/start`" && ctx.includes("new Set")) {
      i += pat.length;
      continue;
    }
    if (pat === "oD(" && /function oD|async function oD/.test(s.slice(Math.max(0, i - 20), i + 5))) {
      i += pat.length;
      n++;
      console.log("\ndefn oD", i);
      continue;
    }
    console.log("\n", pat, i);
    console.log(ctx);
    i += pat.length;
    n++;
  }
}

// Extract full oD and find sendRequest turn/start
function extractFn(src, startNeedle) {
  const start = src.indexOf(startNeedle);
  let depth = 0,
    started = false;
  for (let i = start; i < src.length; i++) {
    if (src[i] === "{") {
      depth++;
      started = true;
    } else if (src[i] === "}") {
      depth--;
      if (started && depth === 0)
        return src.slice(start, i + 1);
    }
  }
  throw new Error("unclosed");
}
const body = extractFn(s, "async function oD(e,t,n){");
const ts = body.indexOf("turn/start");
console.log("\n\n=== oD turn/start region ===");
console.log(body.slice(ts - 500, ts + 800));

// Method that wraps oD for follow-ups
const wrap = s.indexOf("sendUserMessage") >= 0 ? "sendUserMessage" : null;
console.log("\nsendUserMessage?", s.includes("sendUserMessage"));
console.log("continueConversation?", s.includes("continueConversation"));
console.log("addUserMessage?", s.includes("addUserMessage"));
console.log("submitFollowUp?", s.includes("submitFollowUp"));
console.log("steer(", s.includes("async steer"));
