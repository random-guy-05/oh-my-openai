#!/usr/bin/env node
"use strict";

const assert = require("assert");
const acorn = require("acorn");
const asar = require("@electron/asar");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PACKED = path.join(ROOT, "out/app-native-chat-continuity-v59.asar");
const PAGE =
  "webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js";

const page = asar.extractFile(PACKED, PAGE).toString("utf8");
assert.doesNotThrow(() =>
  acorn.parse(page, { ecmaVersion: "latest", sourceType: "module" }),
);
assert.ok(page.includes("native-chat-continuity-v59:native-product-mode"));
assert.ok(page.includes("native-chat-continuity-v59:startup-sync"));
assert.ok(page.includes("sae(i,{currentMode:r,navigate:a,nextMode:`work`,startNewConversation:s})"));
assert.ok(page.includes("CDROnLocal||CDROnRemote||r!==`work`"));
assert.ok(page.includes("native-chat-continuity-v57:hidden-context"));
assert.ok(page.includes("native-chat-continuity-v57:map"));
assert.ok(page.includes("native-chat-continuity-v57:transcript") === false);
assert.ok(!page.includes("professional-chat-mode-v58"));

const local = asar
  .extractFile(PACKED, "webview/assets/local-conversation-thread-Bnxyo76e.js")
  .toString("utf8");
const chat = asar
  .extractFile(
    PACKED,
    "webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  )
  .toString("utf8");
assert.ok(local.includes("native-chat-continuity-v57:transcript"));
assert.ok(chat.includes("native-chat-continuity-v57:official-models"));
assert.ok(!chat.includes("function CDRMergeChatModels"));

console.log("v59 native product-mode transition tests passed");
