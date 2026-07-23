"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const LOCAL = path.join(assets, "local-conversation-thread-Bnxyo76e.js");
const local = fs.readFileSync(LOCAL, "utf8");

// Dump the BAD flatMap fully
const bad = local.indexOf("r.flatMap(({preserveServerUserMessages:t,requests:r,turn:i})");
console.log("BAD flatMap:\n", local.slice(bad - 200, bad + 500));

// Who owns atom al / ll used by extras-tick
for (const n of ["var al=", "al=", "function al", "ll,", "var ll", "const ll"]) {
  // too noisy
}
// Find where extras-tick result is consumed - B=... then uses
const tick = local.indexOf("sticky-chat-v48:extras-tick");
console.log("\nAFTER extras-tick:\n", local.slice(tick, tick + 200));
console.log("\nBEFORE extras-tick (assignment):\n", local.slice(tick - 300, tick));

// Find all e.turn accesses that can throw on undefined e (no optional)
const re = /(?:^|[^?.])\b([erina])\.turn\b/g;
let m;
const hits = [];
while ((m = re.exec(local))) {
  const ctx = local.slice(Math.max(0, m.index - 70), m.index + 50);
  // skip guarded
  if (/\?\.|&&[a-z]\.turn|!r\|\|!r\.turn|e&&e\.turn|n&&n\.turn/.test(local.slice(Math.max(0, m.index - 40), m.index + 10)))
    continue;
  if (/turn\.turn|turnId|turnStarted|turn\.status|turn\.items|turn\.cdrSource|e\.turnIndex|e\.turnKey|e\.turnSearch|e\.turnId/.test(ctx) && !/\.turn\b/.test(ctx.replace(/turn(?:Id|Index|Key|SearchKey|StartedAtMs)/g, "")))
    continue;
  hits.push([m.index, ctx]);
}
console.log("\nUnguarded .turn count roughly", hits.length);
for (const [i, c] of hits.slice(0, 25)) console.log(i, JSON.stringify(c));
