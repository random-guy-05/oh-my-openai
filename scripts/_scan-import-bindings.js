#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const moduleFragment = process.argv[3];
const exportsWanted = new Set(process.argv.slice(4));

for (const name of fs.readdirSync(root)) {
  if (!name.endsWith(".js")) continue;
  const source = fs.readFileSync(path.join(root, name), "utf8");
  for (const match of source.matchAll(/import\{([^}]+)\}from"\.\/([^"]+)"/g)) {
    if (!match[2].includes(moduleFragment)) continue;
    const bindings = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => exportsWanted.has(entry.split(/\s+as\s+/)[0]));
    if (bindings.length) process.stdout.write(`${name}\n  ${bindings.join(", ")}\n`);
  }
}
