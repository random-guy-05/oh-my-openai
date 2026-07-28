#!/usr/bin/env node
"use strict";

/** Route the model-consuming ChatGPT -> Codex context handoff through Luna Light. */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:luna-light-context-v2";

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visitor));
    else if (value?.type) walk(value, visitor);
  }
}

function patch(source, file) {
  if (source.includes(MARKER)) {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
    return source;
  }
  const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  const candidates = [];
  walk(ast, (node) => {
    if (!["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) return;
    const body = source.slice(node.start, node.end);
    if (
      body.includes("ChatGPT conversation does not have a server id") &&
      body.includes("chatGptConversationContexts") &&
      body.includes("model:void 0") &&
      body.includes("thinking:void 0")
    ) candidates.push(node);
  });
  if (candidates.length !== 1) throw new Error(`${path.basename(file)} expected one ChatGPT context handoff, found ${candidates.length}`);
  const node = candidates[0];
  let body = source.slice(node.start, node.end);
  body = body
    .replace("model:void 0", `model:\`gpt-5.6-luna\`/* ${MARKER}:model */`)
    .replace("thinking:void 0", "thinking:`low`");
  if (!body.includes(MARKER) || !body.includes("model:`gpt-5.6-luna`") || !body.includes("thinking:`low`")) {
    throw new Error("Luna Light context replacement did not land");
  }
  const next = source.slice(0, node.start) + body + source.slice(node.end);
  acorn.parse(next, { ecmaVersion: "latest", sourceType: "module" });
  return next;
}

function main() {
  const matches = fs.readdirSync(ASSETS).filter((name) => name.startsWith("use-chatgpt-composer-controller-") && name.endsWith(".js"));
  if (matches.length !== 1) throw new Error(`expected one ChatGPT composer controller, found ${matches.length}`);
  const file = path.join(ASSETS, matches[0]);
  const source = fs.readFileSync(file, "utf8");
  const next = patch(source, file);
  if (!process.argv.includes("--check") && next !== source) fs.writeFileSync(file, next);
  console.log(process.argv.includes("--check") ? "Luna context check ok" : `Luna context patched ${matches[0]}`);
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { patch };
