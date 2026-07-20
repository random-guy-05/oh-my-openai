#!/usr/bin/env node
"use strict";

const assert = require("assert");
const { parse } = require("acorn");
const {
  MARKER,
  patchSource,
  verify,
} = require("./patch-resource-saver");

const source =
  "var SY=32,CY=30*6e4,nY=class{enforce(){return [SY,CY,`browser-tab-budget-suspension-selected`]}};export{nY};";
const once = patchSource(source, "fixture-main.js");
assert.ok(once.includes(MARKER));
assert.ok(once.includes("CODEX_REBUILD_BROWSER_TAB_BUDGET"));
assert.ok(once.includes("CODEX_REBUILD_BROWSER_TAB_WORKING_SET_MINUTES"));
assert.ok(once.includes("??8"));
assert.ok(once.includes("??10"));
parse(once, { ecmaVersion: "latest", sourceType: "module" });
verify(once, "fixture-main.js");

const twice = patchSource(once, "fixture-main.js");
assert.strictEqual(twice, once, "resource patch must be idempotent");
assert.throws(
  () => patchSource(source.replace("=32", "=31"), "changed-main.js"),
  /expected one detached-page budget declaration/,
);

console.log("[ok] resource saver patch defaults, environment overrides, parse, and idempotency");
