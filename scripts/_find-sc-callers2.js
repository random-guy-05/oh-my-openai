#!/usr/bin/env node
"use strict";
const asar = require("@electron/asar");
const root =
  process.argv[2] ||
  require("os").homedir() +
    "/Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar";

const chunkName = asar
  .listPackage(root)
  .find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))
  .replace(/^\//, "");
const short = chunkName.split("/").pop().replace(/\.js$/, "");
console.log("chunk", short);

const files = asar.listPackage(root).filter((f) => f.endsWith(".js") && f.includes("webview"));
for (const f of files) {
  const rel = f.replace(/^\//, "");
  if (rel.includes(short)) continue;
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("oxnpxkxc") && !s.includes(short.slice(0, 20))) continue;
  console.log("\nimports chunk:", rel);
  // find import lines
  let i = s.indexOf("oxnpxkxc");
  while (i >= 0) {
    console.log(s.slice(Math.max(0, i - 80), i + 120));
    i = s.indexOf("oxnpxkxc", i + 1);
    if (i > 0 && s.indexOf("oxnpxkxc", i) === i) break; // safety
    // only first few
    break;
  }
}

// Better: find startConversation( calls in webview excluding the defn file
console.log("\n\n==== startConversation callers ====");
for (const f of files) {
  const rel = f.replace(/^\//, "");
  if (/\/(am|ar|bg|bn|bs|ca|cs|da|de|el|es|et|fa|fi|fr|he|hi|hu|id|it|ja|ko|nl|pl|pt|ro|ru|sv|th|tr|uk|vi|zh)/.test(rel))
    continue;
  let s;
  try {
    s = asar.extractFile(root, rel).toString("utf8");
  } catch {
    continue;
  }
  if (!s.includes("startConversation(")) continue;
  let i = 0,
    n = 0;
  while ((i = s.indexOf("startConversation(", i)) >= 0 && n < 6) {
    const prev = s.slice(Math.max(0, i - 20), i);
    if (prev.includes("async ") || prev.includes("function ")) {
      i += 18;
      continue;
    }
    console.log("\n", rel, i);
    console.log(s.slice(Math.max(0, i - 150), i + 300));
    i += 18;
    n++;
  }
}
