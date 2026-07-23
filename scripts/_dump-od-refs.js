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

// All real oD call/assign patterns via regex
const re = /(?<![A-Za-z0-9_$])oD(?![A-Za-z0-9_$])/g;
let m;
const kinds = {};
while ((m = re.exec(s))) {
  const i = m.index;
  const ctx = s.slice(Math.max(0, i - 30), i + 40).replace(/\n/g, " ");
  let kind = "other";
  if (s.slice(i - 15, i + 3).includes("function oD")) kind = "defn";
  else if (s.slice(i, i + 5).startsWith("oD(") || s.slice(i - 6, i + 3).includes("await oD"))
    kind = "call";
  else if (s.slice(i - 5, i + 8).includes("oD as")) kind = "export";
  else if (/=oD[,}]/.test(s.slice(i - 1, i + 4)) || /oD[,}]/.test(s.slice(i, i + 3)))
    kind = "ref";
  kinds[kind] = (kinds[kind] || 0) + 1;
  if (kind !== "defn" && kind !== "export") {
    console.log(kind, i, ctx);
  }
}

console.log("\ncounts", kinds);

// Find method that likely wraps send for existing threads — search near "async startConversation"
const sc = s.indexOf("async startConversation(");
console.log("\nmethods around startConversation:");
console.log(s.slice(sc - 200, sc + 80));
// list async methods on same class - find preceding 15 async method names
const before = s.slice(Math.max(0, sc - 15000), sc);
const methods = [...before.matchAll(/async\s+(\w+)\s*\(/g)].map((x) => x[1]);
console.log("prev async methods", methods.slice(-25));

const after = s.slice(sc, sc + 20000);
const methodsAfter = [...after.matchAll(/async\s+(\w+)\s*\(/g)].map((x) => x[1]);
console.log("next async methods", methodsAfter.slice(0, 25));

// Look for method that takes conversation id + input and might call Nl/oD
for (const name of [
  "sendPrompt",
  "sendInput",
  "startTurn",
  "enqueueTurn",
  "runTurn",
  "submitTurn",
  "followUp",
  "continueThread",
  "sendFollowUpTurn",
  "steer",
  "interruptTurn",
]) {
  const idx = s.indexOf(`async ${name}(`);
  if (idx >= 0) {
    console.log("\nFOUND", name, idx);
    console.log(s.slice(idx, idx + 400));
  }
}
