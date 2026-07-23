#!/usr/bin/env node

const fs = require("fs");

const file =
  process.argv[2] ||
  "/tmp/codex-v56-asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js";
const source = fs.readFileSync(file, "utf8");
const before = Number(process.env.CDR_INSPECT_BEFORE || 1200);
const after = Number(process.env.CDR_INSPECT_AFTER || 1800);
const needles = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ["versionOptions", "defaultModelSlug", "selectedLabel", "thinkingEffort"];

for (const needle of needles) {
  let offset = 0;
  let count = 0;
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1;
    const start = Math.max(0, offset - before);
    const end = Math.min(source.length, offset + needle.length + after);
    process.stdout.write(`\n=== ${needle} #${count} @${offset} ===\n`);
    process.stdout.write(source.slice(start, end));
    process.stdout.write("\n");
    offset += needle.length;
  }
  if (count === 0) process.stdout.write(`\n=== ${needle}: no matches ===\n`);
}
