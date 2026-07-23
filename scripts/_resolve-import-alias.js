#!/usr/bin/env node

const fs = require("fs");

const file = process.argv[2];
const alias = process.argv[3];
const source = fs.readFileSync(file, "utf8");

for (const match of source.matchAll(/import\{([^}]+)\}from"\.\/([^"]+)"/g)) {
  for (const entry of match[1].split(",").map((value) => value.trim())) {
    const [exported, local = exported] = entry.split(/\s+as\s+/);
    if (local === alias) process.stdout.write(`${exported} from ${match[2]}\n`);
  }
}
