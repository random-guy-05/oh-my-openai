#!/usr/bin/env node
const assert = require("assert/strict");
const { parse } = require("acorn");
const {
  ALLOWED_MODELS,
  callbackPreservesHidden,
  findAllowedModelFilterCallbacks,
} = require("./patch-latest-models");

const allowlist = JSON.stringify(ALLOWED_MODELS);

function matchedCallback(predicate) {
  const ast = parse(`const visible=models.filter(${predicate});`, {
    ecmaVersion: "latest",
    sourceType: "module",
  });
  const callbacks = findAllowedModelFilterCallbacks(ast);
  return callbacks.length === 1 ? callbacks[0] : null;
}

const exact = matchedCallback(`model=>model.hidden===true||${allowlist}.includes(model.model)`);
assert.ok(exact, "exact visible-model filter must match");
assert.equal(callbackPreservesHidden(exact), true, "exact filter must preserve hidden models");

const withoutHidden = matchedCallback(`model=>${allowlist}.includes(model.model)`);
assert.ok(withoutHidden, "an exact allowlist without hidden preservation must be repairable");
assert.equal(callbackPreservesHidden(withoutHidden), false);

assert.equal(
  matchedCallback(`model=>model.hidden===true||[...${allowlist},"gpt-5.5-codex"].includes(model.model)`),
  null,
  "an extra legacy model must fail exact verification",
);
assert.equal(
  matchedCallback(`model=>model.hidden===true||${allowlist}.includes(model.slug)`),
  null,
  "the allowlist must bind to the callback parameter's model property",
);
assert.equal(
  matchedCallback(`model=>other.hidden===true||${allowlist}.includes(model.model)`),
  null,
  "hidden preservation must bind to the same callback parameter",
);
assert.equal(
  matchedCallback(`model=>model.hidden===true||${JSON.stringify([...ALLOWED_MODELS].reverse())}.includes(model.model)`),
  null,
  "allowlist ordering must remain canonical",
);
assert.equal(
  matchedCallback(`model=>(model.hidden===true||${allowlist}.includes(model.model))||model.model==="gpt-5.5-codex"`),
  null,
  "additional predicate branches must not expand the visible catalog",
);

console.log("[ok] latest-model patch structural regression tests passed");
