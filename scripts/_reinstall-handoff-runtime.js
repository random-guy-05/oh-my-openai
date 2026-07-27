#!/usr/bin/env node
"use strict";

/**
 * Swap the embedded handoff runtime in an already-patched bundle.
 *
 * _apply-handoff-sync-v1.js makes five edits; only one of them embeds the
 * runtime body. When the runtime logic changes, re-running the full patch is
 * impossible (it is marker-guarded) and re-extracting upstream would discard
 * every other applied patch. This replaces just the runtime region, which is
 * unambiguously delimited by its marker and its `}CDRInstallHandoffV1();`
 * terminator.
 */

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");
const { installHandoffRuntime, MARKER } = require("./_apply-handoff-sync-v1.js");

const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");
const name = fs
  .readdirSync(ASSETS)
  .find((f) => f.startsWith("app-initial-") && f.endsWith(".js"));
if (!name) throw new Error("app-initial bundle not found");
const MONO = path.join(ASSETS, name);

const HEAD = `function CDRInstallHandoffV1(){/* ${MARKER}:runtime */`;
const TAIL = "}CDRInstallHandoffV1();";

let src = fs.readFileSync(MONO, "utf8");

const start = src.indexOf(HEAD);
if (start === -1) throw new Error(`runtime region not found (missing ${MARKER}:runtime)`);
if (src.indexOf(HEAD, start + 1) !== -1) throw new Error("runtime region is not unique");

const end = src.indexOf(TAIL, start);
if (end === -1) throw new Error("runtime terminator not found");

const replacement =
  HEAD + "\n(" + installHandoffRuntime.toString() + ")();\n" + TAIL;

const next = src.slice(0, start) + replacement + src.slice(end + TAIL.length);

try {
  acorn.parse(next, { ecmaVersion: "latest", sourceType: "module" });
} catch (e) {
  throw new Error(`bundle no longer parses after runtime swap: ${e.message}`);
}

if (process.argv.includes("--check")) {
  console.log(
    `[ok] runtime swap is clean (${end + TAIL.length - start} bytes -> ${replacement.length} bytes)`,
  );
} else {
  fs.writeFileSync(MONO, next);
  console.log(
    `[ok] handoff runtime reinstalled (${end + TAIL.length - start} -> ${replacement.length} bytes)`,
  );
}
