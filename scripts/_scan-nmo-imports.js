#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const root = process.argv[2] || "/tmp/codex-v56-asar/webview/assets";
const wanted = new Set(["Jn", "Qn", "Xn", "Yn", "qn", "s"]);

for (const name of fs.readdirSync(root)) {
  if (!name.endsWith(".js")) continue;
  const file = path.join(root, name);
  const source = fs.readFileSync(file, "utf8");
  const imports = source.matchAll(/import\{([^}]+)\}from"\.\/([^"]*nmo0zeut[^"]*)"/g);
  for (const match of imports) {
    const bindings = match[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => wanted.has(entry.split(/\s+as\s+/)[0]));
    if (bindings.length) process.stdout.write(`${name}\n  ${bindings.join(", ")}\n`);
  }
}
