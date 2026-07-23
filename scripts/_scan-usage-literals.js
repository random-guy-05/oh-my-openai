#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.argv[2];
const seen = new Set();
for (const name of fs.readdirSync(root)) {
  if (!name.endsWith(".js")) continue;
  const source = fs.readFileSync(path.join(root, name), "utf8");
  for (const match of source.matchAll(/([`'"])([^`'"\n]{1,240})\1/g)) {
    const value = match[2];
    if (!/(usage|quota|rate.?limit|message.?cap|token.?count)/i.test(value)) continue;
    if (!/[\/_-]/.test(value)) continue;
    const key = `${name}\t${value}`;
    if (!seen.has(key)) {
      seen.add(key);
      process.stdout.write(`${key}\n`);
    }
  }
}
