#!/usr/bin/env node
"use strict";

/**
 * v59: repair the native product-mode transition in v57.
 *
 * v57 correctly restored the native Chat renderer, catalog, send path, and
 * local-task-to-Chat mapping. Its handoff set the home composer to Chat but
 * never changed the native product mode from `codex` to `work`, leaving the
 * Codex composer and picker mounted. This patch starts from the packed v57
 * artifact and adds only that missing native transition.
 */

const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASE = path.join(ROOT, "out/app-native-chat-continuity-v57.asar");
const OUTPUT = process.env.CDR_PACKED_ASAR
  ? path.resolve(process.env.CDR_PACKED_ASAR)
  : path.join(ROOT, "out/app-native-chat-continuity-v59.asar");
const MARKER = "codex-rebuild:native-chat-continuity-v59";
const PAGE =
  "webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js";

function assert(value, message) {
  if (!value) throw new Error(message);
}

function parseOk(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

async function main() {
  assert(fs.existsSync(BASE), `Missing v57 baseline ${BASE}`);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "codex-v59-"));
  try {
    asar.extractAll(BASE, work);
    const pagePath = path.join(work, PAGE);
    let page = fs.readFileSync(pagePath, "utf8");

    const handoff = "let CDRGoNativeChat=()=>{/* codex-rebuild:native-chat-continuity-v57:handoff */try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}";
    const replacement = handoff +
      "try{sae(i,{currentMode:r,navigate:a,nextMode:`work`,startNewConversation:s})}catch{}/* " +
      MARKER +
      ":native-product-mode */";
    const count = page.split(handoff).length - 1;
    assert(count === 1, `native Chat handoff: expected 1 match, found ${count}`);
    page = page.replace(handoff, replacement);

    const chatSync =
      "if(CDRMode===`chat`){if(CDROnLocal||CDROnRemote)CDRGoNativeChat();else{";
    const repairedChatSync =
      "if(CDRMode===`chat`){if(CDROnLocal||CDROnRemote||r!==`work`)CDRGoNativeChat();else{/* " +
      MARKER +
      ":startup-sync */";
    const syncCount = page.split(chatSync).length - 1;
    assert(syncCount === 1, `native Chat startup sync: expected 1 match, found ${syncCount}`);
    page = page.replace(chatSync, repairedChatSync);

    parseOk("page", page);
    assert(page.includes(MARKER + ":native-product-mode"), "native product-mode transition missing");
    assert(page.includes(MARKER + ":startup-sync"), "startup product-mode sync missing");
    assert(page.includes("native-chat-continuity-v57:hidden-context"), "v57 hidden context missing");
    assert(page.includes("native-chat-continuity-v57:map"), "v57 task mapping missing");
    assert(page.includes("nextMode:`work`"), "native work-mode switch missing");
    assert(!page.includes("professional-chat-mode-v58"), "rejected v58 controller present");

    fs.writeFileSync(pagePath, page);
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    await asar.createPackage(work, OUTPUT);
    console.log(`v59 packed ${OUTPUT}`);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
