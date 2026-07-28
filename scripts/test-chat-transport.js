#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const mono = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((file) => file.startsWith("app-initial-") && file.endsWith(".js")),
);
const local = path.join(
  ASSETS,
  fs.readdirSync(ASSETS).find((file) => file.includes("local-conversation-thread") && file.endsWith(".js")),
);
const source = fs.readFileSync(mono, "utf8");
const localSource = fs.readFileSync(local, "utf8");
const contextName = fs.readdirSync(ASSETS).find((file) => file.startsWith("use-chatgpt-composer-controller-") && file.endsWith(".js"));
const contextSource = fs.readFileSync(path.join(ASSETS, contextName), "utf8");
const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach((child) => walk(child, visitor));
    else if (value?.type) walk(value, visitor);
  }
}

const submitters = [];
walk(ast, (node) => {
  if (!["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node.type)) return;
  const body = source.slice(node.start, node.end);
  if (body.includes("codex-rebuild:all-features-26721-v1:local-submit-hook")) submitters.push(body);
});
if (submitters.length !== 1) throw new Error(`expected exactly one local Chat submit hook, found ${submitters.length}`);
const submit = submitters[0];
const route = submit.indexOf("codex-rebuild:all-features-26721-v1:local-submit-hook");
const native = submit.indexOf("sendRequest(`turn/start`");
if (route < 0 || native < 0 || route >= native) {
  throw new Error("Chat route is not before the native AppServer turn/start call");
}
if (!submit.includes("await CDRStickyChatSend(e,t")) throw new Error("local Chat submitter does not call CDRStickyChatSend");
if (!submit.includes("_cdrSyntheticTurnId='cdr-chat-turn-'")) throw new Error("local Chat submitter lacks a synthetic completed turn");
if (!source.includes("client.startCompletionStream({")) throw new Error("Chat bridge has no ChatGPT stream transport");
if (!source.includes("/(?:^|[-_])codex(?:$|[-_])/")) throw new Error("Chat model filter is not the explicit Codex namespace filter");
if (!source.includes("upsert({role:'user',text:text,source:'chat'})")) throw new Error("Chat user history is truncated before persistence");
if (source.includes("upsert({role:'user',text:text.slice(")) throw new Error("Chat user history still has a persistence length cap");
if (!source.includes("globalThis.indexedDB.open('cdr-chat-history-v1',1)")) throw new Error("Chat history is not persisted outside localStorage quota");
if (!source.includes("let durableRows=await historyStore().load(extrasKey)")) throw new Error("Chat history does not reload its durable full transcript before appending");
if (!source.includes("detail:{key,rows:Array.isArray(rows)?rows:null}")) throw new Error("fresh Chat rows are not published directly to the mounted thread");
if (!source.includes("notify(rows);return val.id")) throw new Error("Chat upserts do not include their fresh transcript snapshot");
if (!source.includes("let finish=done(()=>resolve());")) throw new Error("Chat submit lifecycle has no terminal completion guard");
if (!source.includes("d.message.end_turn===true")) throw new Error("final Chat messages do not reset the submit lifecycle");
if (!source.includes("Promise.resolve(client.startCompletionStream({")) throw new Error("async Chat stream-start failures are not observed");
if (!source.includes(")).catch(done(reject));")) throw new Error("Chat stream-start rejection does not settle the submit action");
if (!localSource.includes("codex-rebuild:chat-extras-render-v1:overlay")) throw new Error("same-task Chat history overlay is missing");
if (!localSource.includes("CDRExtraMapped")) throw new Error("Chat history rows are not mapped into native turn shape");
if (!localSource.includes("__cdrChatHistoryRenderCache")) throw new Error("Chat history rows are reparsed and remapped on every render");
if (!localSource.includes("CDRSetDurableRows")) throw new Error("thread reload does not hydrate durable Chat history");
if (!localSource.includes("CDRDetail?.key&&CDRDetail.key!==CDRKey")) throw new Error("Chat row events can refresh the wrong mounted thread");
if (!localSource.includes("Array.isArray(CDRDetail?.rows))CDRSetDurableRows(CDRDetail.rows)")) throw new Error("mounted thread does not consume fresh Chat rows synchronously");
if (!localSource.includes("CDRDurableLast>=CDRLocalLast")) throw new Error("a stale IndexedDB snapshot can replace newer Chat rows");
if (!localSource.includes("let CDRMerge=")) throw new Error("Chat and native turns are not merged chronologically");
if (localSource.includes("if(!CDRRenderHasGap)")) throw new Error("virtualized transcript gaps can still hide Chat rows");
if (!contextSource.includes("codex-rebuild:luna-light-context-v2:model")) throw new Error("ChatGPT context handoff is not routed through Luna Light");
if (!contextSource.includes("model:`gpt-5.6-luna`")) throw new Error("ChatGPT context handoff model is not Luna Light");
console.log("chat transport contract ok");
