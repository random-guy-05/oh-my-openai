#!/usr/bin/env node
"use strict";

/** Enforce the user-visible mode invariants on an already-patched 26.721 UI. */
const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:mode-ui-invariants-v1";

function asset(prefix) {
  const name = fs.readdirSync(ASSETS).find((file) => file.startsWith(prefix) && file.endsWith(".js"));
  if (!name) throw new Error(`missing ${prefix} bundle`);
  return path.join(ASSETS, name);
}

function parse(source, file) {
  acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  return source;
}

function replaceCount(source, needle, replacement, expected, label) {
  const count = source.split(needle).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected} target(s), found ${count}`);
  return source.split(needle).join(replacement);
}

function functionContaining(source, marker) {
  const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  let best = null;
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) {
      const body = source.slice(node.start, node.end);
      if (body.includes(marker) && (!best || node.end - node.start < best.end - best.start)) best = node;
    }
    for (const value of Object.values(node)) {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value?.type) walk(value);
    }
  };
  walk(ast);
  if (!best) throw new Error(`function containing ${marker} not found`);
  return best;
}

function normalizeModelControllerRegistration(source) {
  const safe = `const registerModelController = (controller) => {
    if (typeof controller !== "function") return () => {};
    modelControllers.add(controller);
    return () => modelControllers.delete(controller);
  };`;
  const formatted = /const registerModelController = \(controller\) => \{[\s\S]*?^  \};(?=\n  const backgroundModel = )/gm;
  const matches = source.match(formatted) || [];
  if (matches.length > 0) source = source.replace(formatted, safe);
  if (!source.includes(safe)) {
    throw new Error("safe model controller registration anchor missing");
  }
  return source;
}

function patchMain(source) {
  source = normalizeModelControllerRegistration(source);
  if (source.includes(`${MARKER}:applied`) && source.includes("CDRObserver=new MutationObserver(CDRMarkSend)")) return source;

  const navigationOld = "onModeSelect:(CDRM)=>{CDRSetMode(CDRM);CDRRuntime.setMode(CDRM);if(CDRM!==`chat`)p(CDRM)}";
  if (source.includes(navigationOld)) {
    source = replaceCount(source, navigationOld, `onModeSelect:(CDRM)=>{/* ${MARKER}:mode-nav */CDRSetMode(CDRM);CDRRuntime.setMode(CDRM);if(CDRM===\`work\`){try{p(CDRM);window.location.reload()}catch{}}else if(CDRM===\`chat\`){try{window.location.reload()}catch{}}else p(CDRM)}`, 1, "mode navigation (work+chat reload, codex navigates)");
  } else if (!source.includes(`${MARKER}:mode-nav`)) {
    throw new Error("mode navigation handler is missing");
  }

  const selectedOld = "let slug=globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPickerModels?.[0]?.model";
  const selectedNew = "let slug=globalThis.__cdrChatSelectedModel||localStorage.getItem(`cdr-chat-model-selection`)||globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPickerModels?.[0]?.model";
  if (source.includes(selectedOld)) source = source.split(selectedOld).join(selectedNew);

  const sendOld = `(0,L$.useEffect)(()=>{try{if(typeof document==="undefined"||!document.querySelectorAll)return;document.querySelectorAll(\`button[aria-label],[role="button"][aria-label]\`).forEach((el)=>{const al=String(el.getAttribute("aria-label")||"");if(al==="Send"||al==="Submit"){if(!el.classList.contains("cdr-mode-send"))el.classList.add("cdr-mode-send");}});}catch{}},[CDRMode]);`;
  const sendNew = `(0,L$.useEffect)(()=>{let CDRObserver=null;try{if(typeof document==="undefined"||!document.querySelectorAll)return;let CDRMarkSend=()=>document.querySelectorAll(\`button[aria-label],button[type="submit"],[role="button"][aria-label],[data-testid*="send" i]\`).forEach((el)=>{const al=String(el.getAttribute("aria-label")||el.getAttribute("title")||el.getAttribute("data-testid")||"");const form=el.closest&&el.closest("form");const composerSubmit=el.getAttribute("type")==="submit"&&form&&form.querySelector("textarea,[contenteditable=true]");if(/send|submit/i.test(al)||composerSubmit){if(!el.classList.contains("cdr-mode-send"))el.classList.add("cdr-mode-send");}});CDRMarkSend();if(typeof MutationObserver!=="undefined"&&document.body){CDRObserver=new MutationObserver(CDRMarkSend);CDRObserver.observe(document.body,{childList:true,subtree:true})}}catch{}return()=>{try{CDRObserver&&CDRObserver.disconnect()}catch{}}},[CDRMode]);`;
  if (source.includes(sendOld)) source = source.split(sendOld).join(sendNew);
  if (!source.includes("CDRObserver=new MutationObserver(CDRMarkSend)")) throw new Error("send-button remount observer did not land");

  const selectorNode = functionContaining(source, "codex-rebuild:local-canonical-selector-v3");
  let selector = source.slice(selectorNode.start, selectorNode.end);
  selector = selector
    .replaceAll("(0,W8.jsx)(Z,{...G8.chatGpt})", "`ChatGPT`")
    .replaceAll("(0,W8.jsx)(Z,{...G8.work})", "`ChatGPT`")
    .replaceAll("o.formatMessage(G8.chatGpt)", "`ChatGPT`")
    .replaceAll("o.formatMessage(G8.work)", "`ChatGPT`");
  source = source.slice(0, selectorNode.start) + selector + source.slice(selectorNode.end);

  if (!selector.includes("ChatGPT") || selector.includes("G8.chatGpt")) {
    throw new Error("ChatGPT label did not replace upstream ChatGPT label");
  }
  if (!source.includes(`${MARKER}:applied`)) source += `\n/* ${MARKER}:applied */\n`;
  return source;
}

function patchHome(source) {
  if (source.includes(`${MARKER}:home-toggle`)) return source;
  source = replaceCount(
    source,
    "m(`relative isolate inline-grid h-8",
    `m(\`cdr-home-mode-toggle relative isolate inline-grid h-8`,
    1,
    "home mode toggle class",
  );
  return source + `\n/* ${MARKER}:home-toggle */\n`;
}

function patchCss(source) {
  if (source.includes(`${MARKER}:css`)) return source;
  return source + `\n/* ${MARKER}:css */\n:root[data-codex-product-mode="chat"] .cdr-home-mode-toggle{display:none!important}\n`;
}

function main() {
  const mainFile = asset("app-initial-");
  const homeFile = asset("home-composer-mode-toggle-");
  const cssFile = path.join(ASSETS, fs.readdirSync(ASSETS).find((file) => file.startsWith("app-") && file.endsWith(".css")));
  const targets = [
    [mainFile, patchMain, parse],
    [homeFile, patchHome, parse],
    [cssFile, patchCss, (value) => value],
  ];
  for (const [file, patcher, verifier] of targets) {
    const source = fs.readFileSync(file, "utf8");
    const next = verifier(patcher(source), file);
    if (!process.argv.includes("--check") && next !== source) fs.writeFileSync(file, next);
  }
  console.log(process.argv.includes("--check") ? "mode UI invariants check ok" : "mode UI invariants patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { patchMain, patchHome, patchCss };
