#!/usr/bin/env node

const fs = require("fs");

const file = process.argv[2];
const exported = process.argv[3];
const source = fs.readFileSync(file, "utf8");
const match = source.match(/export\{([^}]+)\};?\s*(?:\/\/# sourceMappingURL=.*)?$/s);
if (!match) process.exit(1);
for (const entry of match[1].split(",").map((value) => value.trim())) {
  const [local, name = local] = entry.split(/\s+as\s+/);
  if (name === exported) process.stdout.write(`${local}\n`);
}
