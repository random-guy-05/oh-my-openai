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

// All await oD( sites with surrounding function names
let i = 0;
while ((i = s.indexOf("await oD(", i)) >= 0) {
  // find preceding async method name
  const before = s.slice(Math.max(0, i - 800), i);
  const m = before.match(/async\s+(\w+)\s*\([^)]*\)\s*\{[^}]*$/);
  const m2 = [...before.matchAll(/async\s+(\w+)\s*\(/g)].pop();
  console.log("\n==== await oD @", i, "method?", m2 && m2[1]);
  console.log(s.slice(i, i + 350));
  // what follows the await - next 200 chars after the call ends roughly
  // find matching paren end is hard; show 600 chars
  console.log("--- AFTER ---");
  console.log(s.slice(i, i + 700));
  i += 9;
}

// Search for `.turn` immediately after something that looks like send result
console.log("\n\n==== patterns like result.turn / n.turn after send ====");
for (const pat of [
  "return(await oD",
  "return await oD",
  "=await oD(",
  ".turn;",
  "?.turn",
  "response.turn",
  "result.turn",
  "firstTurn",
  "sendUserMessage",
  "sendMessage",
  "continueTurn",
  "startTurn",
]) {
  let j = 0,
    n = 0;
  while ((j = s.indexOf(pat, j)) >= 0 && n < 6) {
    console.log("\nPAT", pat, j);
    console.log(s.slice(Math.max(0, j - 100), j + 200));
    j += pat.length;
    n++;
  }
}
