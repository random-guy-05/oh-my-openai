#!/usr/bin/env node
"use strict";

/**
 * v58: professional same-thread Chat mode.
 *
 * - Restore the last known-good same-local-thread mode controller (v38).
 * - Build Chat choices from the live Codex AppServer model list.
 * - Render model + effort combinations as native menu items in Chat mode.
 * - Keep native Codex picker behavior in Codex/Work modes.
 * - Add per-task observed quota + exact token telemetry beside feedback.
 * - Preserve the existing low-level task-limit turn-start guard.
 */

const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const ASSETS = path.join(ASAR_ROOT, "webview/assets");
const BASE_V38 = path.join(ROOT, "out/app-chat-models-v38.asar");
const BASE_V42 = path.join(ROOT, "out/app-chat-usage-v42.asar");
const OUTPUT = path.join(ROOT, "out/app-professional-chat-mode-v58.asar");
const MARKER = "codex-rebuild:professional-chat-mode-v58";

const FILES = {
  page: "app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  settings: "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
  feedback: "app-initial~app-main~settings-command-menu-section-items~first-run~plugin-detail-page~onboa~eoalflv1-CCJ8Krkt.js",
  send: "app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
};

function assert(value, message) {
  if (!value) throw new Error(message);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  assert(count === 1, `${label}: expected 1 match, found ${count}`);
  return source.replace(from, to);
}

function asset(packagePath, name) {
  assert(fs.existsSync(packagePath), `Missing baseline ${packagePath}`);
  return asar.extractFile(packagePath, `webview/assets/${name}`).toString("utf8");
}

function parse(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    fs.writeFileSync(path.join("/tmp", `v58-${label}-parse-error.js`), source);
    throw new Error(`${label}: ${error.message}`);
  }
}

function patchPage(current, knownGood) {
  const oldStart = current.indexOf("let CDROnLocal=!!am(`/local/:conversationId`)");
  const oldEnd = current.indexOf(";let d;return", oldStart);
  const goodStart = knownGood.indexOf("(0,BI.useLayoutEffect)(()=>{if(r!==`codex`)");
  const goodEnd = knownGood.indexOf(";let d;return", goodStart);
  assert(oldStart >= 0 && oldEnd > oldStart, "v42 route-changing mode block missing");
  assert(goodStart >= 0 && goodEnd > goodStart, "v38 same-thread mode block missing");
  const sameThread = knownGood
    .slice(goodStart, goodEnd)
    .replace("u=e=>{", "u=e=>{/* " + MARKER + ":same-thread */");
  return current.slice(0, oldStart) + sameThread + current.slice(oldEnd);
}

function patchSettings(source) {
  const externalBridge =
    "let CDRApply=presetSettings[next];if(next===`chat`){try{let slug=globalThis.__cdrChatDefaultSlug||(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===`auto`)?.model||globalThis.__cdrChatPickerModels?.[0]?.model;if(slug){let hit=(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===slug);CDRApply={model:slug,reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`}}}catch{}}const result = controller(CDRApply);";
  const bridgeCount = source.split(externalBridge).length - 1;
  assert(bridgeCount === 2, `remove external model bridge: expected 2 matches, found ${bridgeCount}`);
  source = source.split(externalBridge).join("const result = controller(presetSettings[next]);");

  source = replaceOnce(
    source,
    "te=Cg(y,l),ne=Ug(y)/* codex-rebuild:chat-usage-v41:picker-clean */",
    "te=CDRMode===`chat`?Ug(y):Cg(y,l),ne=Ug(y)/* " + MARKER + ":live-codex-models */",
    "dynamic same-backend Chat selections",
  );

  source = replaceOnce(
    source,
    "showReasoningEffortControls:!0",
    "showReasoningEffortControls:CDRMode!==`chat`/* " + MARKER + ":flat-chat */",
    "hide separate Chat effort controls",
  );

  const effortChip =
    "(0,yk.jsx)(Jr,{collapse:`sm`,className:`shrink-0`,children:(0,yk.jsx)(X,{...Cb[W]})})";
  source = replaceOnce(
    source,
    effortChip,
    "CDRMode!==`chat`||U.length>1?" + effortChip + ":null",
    "single Chat selection trigger label",
  );

  const menuStart = source.indexOf("function MO(");
  assert(menuStart >= 0, "native model menu function missing");
  const expressionStart = source.indexOf("_e=G?ne?", menuStart);
  const expressionEnd = source.indexOf(",t[137]=U", expressionStart);
  assert(expressionStart >= 0 && expressionEnd > expressionStart, "native menu view expression missing");
  const nativeExpression = source.slice(expressionStart + 3, expressionEnd);
  const flatExpression =
    "globalThis.__cdrLocalModeV4?.mode?.()===`chat`?" +
    "(0,FO.jsxs)(FO.Fragment,{children:[" +
    "(0,FO.jsx)(zy.Title,{children:(0,FO.jsx)(X,{id:`cdr.chat.modelPicker.title`,defaultMessage:`Model`,description:`Header above the flat model choices for same-thread Chat mode`})})," +
    "(0,FO.jsx)(`div`,{className:`vertical-scroll-fade-mask flex max-h-[320px] flex-col overflow-y-auto`,children:w.map(e=>{" +
    "let t=e.id===J?.id,n=p?.find(t=>t.model===e.model)?.supportedReasoningEfforts?.length??0;" +
    "return(0,FO.jsx)(zy.Item,{\"data-model-selected\":t?`true`:void 0,RightIcon:t?ct:void 0,onSelect:()=>{y(e.model,e.reasoningEffort),v?.()},children:" +
    "(0,FO.jsxs)(`span`,{className:`flex min-w-0 items-center gap-1.5`,children:[" +
    "(0,FO.jsx)(`span`,{className:`truncate`,children:e.modelLabel})," +
    "n>1?(0,FO.jsx)(`span`,{className:`shrink-0 text-token-description-foreground`,children:(0,FO.jsx)(X,{...Cb[e.reasoningEffort]})}):null]})},e.id)})})]})" +
    ":" + nativeExpression;
  source =
    source.slice(0, expressionStart) +
    "_e=" + flatExpression +
    source.slice(expressionEnd);

  return source;
}

const USAGE_HELPER =
  "function CDRTaskUsageSummary(e){/* " + MARKER + ":usage-badge */try{" +
  "let t=globalThis.__cdrUsageV1?.summary?.(e),n=null;" +
  "if(!t){let r=JSON.parse(localStorage.getItem(`cdr-usage-v1`)||`null`)?.threads?.[String(e||``)];if(!r)return null;" +
  "let d=k=>r.windows?.[k]&&r.baseline?.[k]?Math.max(0,Number(r.windows[k].usedPercent||0)-Number(r.baseline[k].usedPercent||0)):null;" +
  "n={fiveHourDelta:d(`fiveHour`),weeklyDelta:d(`weekly`),usage:r.usage||{total:{totalTokens:0}},config:r.config||{}}}else n=t;" +
  "let r=[n.fiveHourDelta,n.weeklyDelta].filter(Number.isFinite),i=r.length?Math.max(...r):0,a=Number(n.usage?.total?.totalTokens||0);" +
  "return{quotaPercent:i,tokens:Number.isFinite(a)?a:0,fiveHour:n.fiveHourDelta,weekly:n.weeklyDelta,config:n.config||{}}" +
  "}catch{return null}}";

function patchFeedback(source) {
  source = replaceOnce(source, "function At(e){", USAGE_HELPER + "function At(e){", "usage helper");
  source = replaceOnce(
    source,
    "d=n(u),[f,p]=(0,It.useState)(null),m=r(N)",
    "d=n(u),[f,p]=(0,It.useState)(null),[CDRUsageTick,CDRSetUsageTick]=(0,It.useState)(0);(0,It.useEffect)(()=>{let e=setInterval(()=>CDRSetUsageTick(e=>e+1),1500);return()=>clearInterval(e)},[]);let CDRUsage=CDRTaskUsageSummary(o),m=r(N)",
    "poll task telemetry",
  );
  const oldTail =
    "let v=_,y;return t[14]!==v||t[15]!==f?(y=(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(Pt,{rating:`thumbs_up`,selectedRating:f,onClick:v}),(0,Z.jsx)(Pt,{rating:`thumbs_down`,selectedRating:f,onClick:v})]}),t[14]=v,t[15]=f,t[16]=y):y=t[16],y}";
  const newTail =
    "let v=_,CDRUsageNode=CDRUsage?(0,Z.jsx)(`span`,{className:`ml-1 select-none whitespace-nowrap text-xs tabular-nums text-token-description-foreground`,title:`Task usage · 5h ${CDRUsage.fiveHour==null?`n/a`:CDRUsage.fiveHour.toFixed(1)+`%`} · week ${CDRUsage.weekly==null?`n/a`:CDRUsage.weekly.toFixed(1)+`%`} · ${CDRUsage.tokens.toLocaleString()} tokens`,children:`${CDRUsage.quotaPercent.toFixed(1)}% · ${CDRUsage.tokens.toLocaleString()} tokens`}):null;return(0,Z.jsxs)(Z.Fragment,{children:[(0,Z.jsx)(Pt,{rating:`thumbs_up`,selectedRating:f,onClick:v}),(0,Z.jsx)(Pt,{rating:`thumbs_down`,selectedRating:f,onClick:v}),CDRUsageNode]})}";
  return replaceOnce(source, oldTail, newTail, "feedback usage badge");
}

function verify(files) {
  for (const [label, source] of Object.entries(files)) parse(label, source);
  assert(files.page.includes("Chat preset — same task and history"), "same-thread Chat menu missing");
  assert(files.page.includes(MARKER + ":same-thread"), "same-thread controller missing");
  assert(!files.page.includes("native-chat-continuity-v57"), "v57 route handoff remains");
  assert(!files.page.includes("chat-usage-v42:sync"), "v42 route handoff remains");
  assert(files.settings.includes(MARKER + ":live-codex-models"), "dynamic Chat model list missing");
  assert(files.settings.includes(MARKER + ":flat-chat"), "flat Chat mode flag missing");
  assert(files.settings.includes("cdr.chat.modelPicker.title"), "native flat Chat menu missing");
  assert(!files.settings.includes("CDRChatFlatSelector"), "plain HTML selector remains");
  assert(!files.settings.includes("__cdrChatPickerModels"), "external ChatGPT catalog bridge remains");
  assert(!files.settings.includes("client.models()"), "ChatGPT model request remains");
  assert(files.feedback.includes(MARKER + ":usage-badge"), "usage badge missing");
  assert(files.send.includes("codex-rebuild:usage-guard-v1"), "task limit guard missing");
  assert(!files.send.includes("CDRStickyChatSend"), "side-channel send bridge remains");
}

async function main() {
  const files = {
    page: patchPage(asset(BASE_V42, FILES.page), asset(BASE_V38, FILES.page)),
    settings: patchSettings(asset(BASE_V42, FILES.settings)),
    feedback: patchFeedback(asset(BASE_V42, FILES.feedback)),
    send: asset(BASE_V42, FILES.send),
  };
  verify(files);

  if (process.argv.includes("--check")) {
    console.log("v58 check ok");
    return;
  }

  for (const [label, name] of Object.entries(FILES)) {
    fs.writeFileSync(path.join(ASSETS, name), files[label]);
  }
  console.log("v58 sources written");

  if (process.argv.includes("--pack")) {
    await asar.createPackage(ASAR_ROOT, OUTPUT);
    console.log(`v58 packed ${OUTPUT}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
