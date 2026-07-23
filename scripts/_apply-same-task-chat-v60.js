#!/usr/bin/env node
"use strict";

/**
 * v61: same-task Chat, with the Codex UI and Codex model state left intact.
 *
 * Starts from the last same-task build (v56) and changes only four seams:
 * - the Chat picker uses Codex's native menu components;
 * - the picker is populated from the signed-in Chat catalog;
 * - Chat streams use decoded message snapshots and persist continuation IDs;
 * - the existing Codex transcript is supplied once when a Chat conversation starts.
 */

const acorn = require("acorn");
const asar = require("@electron/asar");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  assertTaskLimitWithoutRuntime,
  installUsageRuntime,
} = require("./patch-usage-controls");

const ROOT = path.join(__dirname, "..");
const BASE = process.env.CDR_BASE_ASAR
  ? path.resolve(process.env.CDR_BASE_ASAR)
  : path.join(ROOT, "out", "app-chat-models-v56.asar");
const OUTPUT = process.env.CDR_PACKED_ASAR
  ? path.resolve(process.env.CDR_PACKED_ASAR)
  : path.join(ROOT, "out", "app-same-task-chat-v61.asar");
const WORK = process.env.CDR_ASAR_ROOT
  ? path.resolve(process.env.CDR_ASAR_ROOT)
  : fs.mkdtempSync(path.join(os.tmpdir(), "cdr-v60-"));
const MARKER = "codex-rebuild:same-task-chat-v61";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function replaceOnce(source, from, to, label) {
  const count = source.split(from).length - 1;
  assert(count === 1, `${label}: expected 1 match, found ${count}`);
  return source.replace(from, to);
}

function extractFunction(source, needle) {
  const start = source.indexOf(needle);
  assert(start >= 0, `Missing ${needle}`);
  let depth = 0;
  let begun = false;
  for (let index = start; index < source.length; index++) {
    if (source[index] === "{") {
      depth++;
      begun = true;
    } else if (source[index] === "}") {
      depth--;
      if (begun && depth === 0) return { start, end: index + 1 };
    }
  }
  throw new Error(`Unclosed ${needle}`);
}

function parseOk(label, source) {
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${label}: ${error.message}`);
  }
}

function asset(root, fragment) {
  const assets = path.join(root, "webview", "assets");
  const name = fs.readdirSync(assets).find((entry) => entry.includes(fragment) && entry.endsWith(".js"));
  assert(name, `Missing asset ${fragment}`);
  return path.join(assets, name);
}

function buildCatalogRuntime(e) {
  /* codex-rebuild:same-task-chat-v61:authoritative-catalog */
  try {
    if (!e || typeof e !== "object") return e;
    const options = Array.isArray(e.options) ? e.options : [];
    const versions = Array.isArray(e.versionOptions) ? e.versionOptions : [];
    const rawModels = Array.isArray(globalThis.__cdrChatRawModels)
      ? globalThis.__cdrChatRawModels
      : [];
    const rawTitleBySlug = new Map(
      rawModels
        .filter((model) => model && typeof model.slug === "string")
        .map((model) => [model.slug, String(model.title || model.slug)]),
    );
    const rows = [];
    const models = [];
    const seen = new Set();
    for (const option of options) {
      if (!option || typeof option.slug !== "string" || !option.slug || option.hidden === true) continue;
      const apiEffort = option.thinkingEffort == null || option.thinkingEffort === ""
        ? "none"
        : String(option.thinkingEffort);
      const key = `${option.slug}:${apiEffort}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const matchingVersion = versions.find((version) =>
        Array.isArray(version && version.options) &&
        version.options.some((candidate) =>
          candidate &&
          candidate.slug === option.slug &&
          (candidate.thinkingEffort == null ? "none" : String(candidate.thinkingEffort)) === apiEffort,
        ),
      );
      const rawTitle = rawTitleBySlug.get(option.slug);
      const baseLabel = String(
        option.lane === "instant"
          ? rawTitle || option.modelLabel || option.slug
          : matchingVersion?.label || rawTitle || option.modelLabel || option.slug,
      );
      const variant = String(option.selectedLabel || option.title || "").trim();
      const lowerBase = baseLabel.toLocaleLowerCase();
      const lowerVariant = variant.toLocaleLowerCase();
      const displayName = !variant || lowerBase === lowerVariant || lowerVariant.startsWith(`${lowerBase} `)
        ? variant || baseLabel
        : `${baseLabel} ${variant}`;
      const model = `chat:${encodeURIComponent(option.slug)}:${encodeURIComponent(apiEffort)}`;
      const row = {
        id: model,
        model,
        apiModel: option.slug,
        modelLabel: displayName,
        sliderLabel: displayName,
        reasoningEffort: "none",
        apiEffort,
        powerSettingIndex: rows.length,
        lane: option.lane || null,
      };
      rows.push(row);
      models.push({
        id: model,
        model,
        displayName,
        description: typeof option.description === "string" ? option.description : "",
        hidden: false,
        supportedReasoningEfforts: [{ reasoningEffort: "none", description: displayName }],
        defaultReasoningEffort: "none",
        isDefault: false,
      });
    }
    if (!rows.length) return e;
    const defaultRow = rows.find((row) => row.apiModel === e.defaultModelSlug) || rows[0];
    const defaultSlug = defaultRow.model;
    for (const model of models) model.isDefault = model.model === defaultSlug;
    let stored = "";
    try { stored = localStorage.getItem("cdr-chat-model-selection") || ""; } catch {}
    const selected = rows.find((row) => row.model === stored) ||
      rows.find((row) => row.model === globalThis.__cdrChatSelectedModel) ||
      defaultRow;
    const signature = JSON.stringify([
      defaultSlug,
      rows.map((row) => [row.model, row.apiModel, row.apiEffort, row.modelLabel]),
    ]);
    const changed = globalThis.__cdrChatCatalogSignature !== signature ||
      globalThis.__cdrChatSelectedModel !== selected.model;
    globalThis.__cdrChatCatalog = e;
    globalThis.__cdrChatCatalogSignature = signature;
    globalThis.__cdrChatDefaultSlug = defaultSlug;
    globalThis.__cdrChatDefaultApiSlug = defaultRow.apiModel;
    globalThis.__cdrChatPowerRows = rows;
    globalThis.__cdrChatPickerModels = models;
    globalThis.__cdrChatSelectedModel = selected.model;
    try { localStorage.setItem("cdr-chat-model-selection", selected.model); } catch {}
    if (changed) {
      try {
        window.dispatchEvent(new CustomEvent("cdr-chat-models-change", {
          detail: { count: rows.length, defaultModelSlug: defaultSlug, selectedModel: selected.model },
        }));
      } catch {}
    }
    return e;
  } catch (error) {
    try { console.error("[cdr] authoritative Chat catalog", error); } catch {}
    return e;
  }
}

const CATALOG_BUILDER = buildCatalogRuntime
  .toString()
  .replace("buildCatalogRuntime", "CDRMergeChatModels");

function buildTaskUsageBadgeRuntime({ threadId }) {
  /* codex-rebuild:same-task-chat-v61:task-usage-badge */
  const [, setTick] = (0, hT.useState)(0);
  (0, hT.useEffect)(() => {
    const update = (event) => {
      const detail = event?.detail;
      if (
        detail?.threadKey === threadId ||
        (Array.isArray(detail?.aliases) && detail.aliases.includes(threadId))
      ) {
        setTick((value) => value + 1);
      }
    };
    try { window.addEventListener("cdr-usage-change", update); } catch {}
    return () => {
      try { window.removeEventListener("cdr-usage-change", update); } catch {}
    };
  }, [threadId]);
  let mode = "codex";
  try { mode = globalThis.__cdrLocalModeV4?.mode?.() || "codex"; } catch {}
  if (mode === "chat") return null;
  let summary = null;
  try { summary = globalThis.__cdrUsageV1?.summary(threadId); } catch {}
  if (!summary) return null;
  const parts = [];
  if (summary.fiveHourDelta != null) parts.push(`5h +${summary.fiveHourDelta.toFixed(1)}%`);
  if (summary.weeklyDelta != null) parts.push(`7d +${summary.weeklyDelta.toFixed(1)}%`);
  if (summary.hasExactUsage && summary.usage?.total?.totalTokens != null) {
    parts.push(`${Number(summary.usage.total.totalTokens).toLocaleString()} tokens`);
  }
  if (!parts.length) return null;
  return (0, gT.jsx)("span", {
    className: "ml-1.5 flex h-full items-center gap-1.5 text-xs leading-5 text-token-text-tertiary",
    title: "Observed task usage. Quota values are account-usage deltas since this task began; token totals are exact AppServer counters.",
    "aria-label": `Task usage: ${parts.join(", ")}`,
    children: [
      (0, gT.jsx)("span", { className: "h-3 border-l border-token-border", "aria-hidden": true }),
      (0, gT.jsx)("span", { children: parts.join(" · ") }),
    ],
  });
}

const TASK_USAGE_BADGE = buildTaskUsageBadgeRuntime
  .toString()
  .replace("buildTaskUsageBadgeRuntime", "CDRTaskUsageBadge");

const BRIDGE = String.raw`async function CDRStickyChatSend(e,t,n){/* codex-rebuild:same-task-chat-v61:bridge */
  function chatMode(){
    try{if(globalThis.__cdrLocalModeV4?.mode?.() === "chat")return true}catch{}
    try{if(document.documentElement.getAttribute("data-codex-product-mode") === "chat")return true}catch{}
    try{return String(localStorage.getItem("cdr-product-mode")||"").replace(/^["']|["']$/g,"") === "chat"}catch{return false}
  }
  if(!chatMode())return false;
  const textOf=value=>{
    if(value==null)return "";
    if(typeof value === "string")return value;
    if(Array.isArray(value))return value.map(textOf).filter(Boolean).join("\n");
    if(typeof value !== "object")return "";
    if(typeof value.text === "string")return value.text;
    if(typeof value.content === "string")return value.content;
    if(Array.isArray(value.parts))return value.parts.map(textOf).filter(Boolean).join("");
    if(Array.isArray(value.content))return value.content.map(textOf).filter(Boolean).join("\n");
    return "";
  };
  const text=String(textOf(n&&n.input)||"").trim();
  if(!text)return "absorbed";
  const key=String(t||"").includes(":")?String(t):"local:"+t;
  const existingContext=globalThis.__cdrCodexContextByThread?.[key]?.text;
  const extrasKey="cdr-thread-extras:"+key;
  const notify=()=>{try{window.dispatchEvent(new CustomEvent("cdr-thread-extras-change",{detail:{key}}))}catch{}};
  const upsert=turn=>{
    try{
      let rows=JSON.parse(localStorage.getItem(extrasKey)||"[]");
      if(!Array.isArray(rows))rows=[];
      const value={...turn,id:turn.id||((crypto.randomUUID&&crypto.randomUUID())||"chat-"+Date.now()),ts:turn.ts||Date.now(),source:turn.source||"chat"};
      const index=rows.findIndex(row=>row&&row.id===value.id);
      if(index>=0)rows[index]={...rows[index],...value};else rows.push(value);
      localStorage.setItem(extrasKey,JSON.stringify(rows.slice(-400)));
      notify();
      return value.id;
    }catch{return turn.id||null}
  };
  if((!globalThis.__cdrChatClient||typeof globalThis.__cdrChatClient.startCompletionStream!=="function")&&!globalThis.__cdrEnsureChatClient){
    try{const transport=await import("./__CDR_CHAT_ASSET__");if(typeof transport.Gn==="function")transport.Gn()}catch(error){try{console.error("[cdr] failed to load Chat transport",error)}catch{}}
  }
  let client=globalThis.__cdrChatClient;
  if(!client||typeof client.startCompletionStream!=="function"){
    try{client=globalThis.__cdrEnsureChatClient?.()}catch{client=null}
  }
  upsert({role:"user",text,source:"chat"});
  if(!client||typeof client.startCompletionStream!=="function"){
    upsert({role:"assistant",text:"Chat is temporarily unavailable. This message was not sent.",source:"chat-error"});
    return true;
  }
  let logicalModel=globalThis.__cdrChatSelectedModel;
  try{logicalModel=logicalModel||localStorage.getItem("cdr-chat-model-selection")}catch{}
  const rows=Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[];
  const selected=rows.find(row=>row.model===logicalModel)||rows.find(row=>row.model===globalThis.__cdrChatDefaultSlug)||rows[0];
  if(!selected){
    upsert({role:"assistant",text:"Chat models are still loading. Please send again when the model name appears.",source:"chat-error"});
    return true;
  }
  const model=selected.apiModel;
  const effort=selected.apiEffort==="none"||selected.apiEffort==="minimal"?undefined:selected.apiEffort;
  let store={};
  try{store=JSON.parse(localStorage.getItem("cdr-chat-thread-state-v1")||"{}")||{}}catch{}
  store.byLocal=store.byLocal&&typeof store.byLocal==="object"?store.byLocal:{};
  let state=store.byLocal[key];
  if(typeof state === "string")state={conversationId:state};
  state=state&&typeof state==="object"?state:{};
  let conversationId=typeof state.conversationId==="string"?state.conversationId:null;
  let parentMessageId=typeof state.parentMessageId==="string"?state.parentMessageId:null;
  const continuing=Boolean(conversationId&&parentMessageId);
  if(!continuing){conversationId=null;parentMessageId=(crypto.randomUUID&&crypto.randomUUID())||"parent-"+Date.now()}
  let prompt=text;
  if(!continuing){
    const prior=existingContext;
    if(typeof prior === "string"&&prior.trim())prompt=prior+"\n\n<current_user_message>\n"+text+"\n</current_user_message>";
  }
  const messageId=(crypto.randomUUID&&crypto.randomUUID())||"user-"+Date.now();
  const assistantId=(crypto.randomUUID&&crypto.randomUUID())||"assistant-"+Date.now();
  let assistant="";
  let nextParent=null;
  let seenConversation=conversationId;
  let flushTimer=null;
  const flush=()=>{if(flushTimer!=null){clearTimeout(flushTimer);flushTimer=null}if(assistant)upsert({id:assistantId,role:"assistant",text:assistant,source:"chat",status:"streaming"})};
  const scheduleFlush=()=>{if(flushTimer==null)flushTimer=setTimeout(flush,45)};
  try{
    await new Promise((resolve,reject)=>{
      let settled=false;
      const timeout=setTimeout(()=>{if(!settled){settled=true;reject(new Error("Chat response timed out"))}},120000);
      const finish=fn=>value=>{if(settled)return;settled=true;clearTimeout(timeout);fn(value)};
      try{
        client.startCompletionStream({
          request:{
            action:"next",
            client_prepare_state:"sent",
            conversation_id:conversationId||undefined,
            messages:[{author:{role:"user"},content:{content_type:"text",parts:[prompt]},id:messageId,metadata:{}}],
            model,
            parent_message_id:parentMessageId,
            thinking_effort:effort,
            timezone:Intl.DateTimeFormat().resolvedOptions().timeZone,
            timezone_offset_min:new Date().getTimezoneOffset()
          },
          onUpdate:update=>{
            try{
              if(update?.conversationId)seenConversation=update.conversationId;
              const message=update?.message;
              if(message?.id)nextParent=message.id;
              const parts=message?.content?.parts;
              if(Array.isArray(parts)){
                const snapshot=parts.map(textOf).join("");
                if(snapshot){assistant=snapshot;scheduleFlush()}
              }
            }catch{}
          },
          onEvent:event=>{
            try{
              let data=event?.data;
              if(typeof data === "string"){try{data=JSON.parse(data)}catch{return}}
              if(data?.conversation_id||data?.conversationId)seenConversation=data.conversation_id||data.conversationId;
              if(data?.message?.id)nextParent=data.message.id;
            }catch{}
          },
          onComplete:finish(resolve),
          onError:finish(error=>reject(error?.error||error))
        });
      }catch(error){finish(reject)(error)}
    });
    flush();
    if(!assistant)assistant="Chat returned no displayable text.";
    upsert({id:assistantId,role:"assistant",text:assistant,source:"chat",status:"completed"});
    if(seenConversation&&nextParent){
      store.byLocal[key]={conversationId:seenConversation,parentMessageId:nextParent,model,updatedAt:Date.now()};
      localStorage.setItem("cdr-chat-thread-state-v1",JSON.stringify(store));
      try{
        let legacy=JSON.parse(localStorage.getItem("cdr-thread-map")||"{}")||{};
        legacy.byLocal=legacy.byLocal&&typeof legacy.byLocal==="object"?legacy.byLocal:{};
        legacy.byChat=legacy.byChat&&typeof legacy.byChat==="object"?legacy.byChat:{};
        legacy.byLocal[key]=seenConversation;legacy.byChat[seenConversation]=key;
        localStorage.setItem("cdr-thread-map",JSON.stringify(legacy));
      }catch{}
    }
    return true;
  }catch(error){
    if(flushTimer!=null)clearTimeout(flushTimer);
    upsert({id:assistantId,role:"assistant",text:"Chat error: "+String(error?.message||error),source:"chat-error",status:"completed"});
    return true;
  }
}`;

function patchSettings(source, chatAssetName) {
  const oldUsageRuntime = extractFunction(source, "function installUsageRuntime() {");
  source =
    source.slice(0, oldUsageRuntime.start) +
    installUsageRuntime.toString() +
    source.slice(oldUsageRuntime.end);
  source = replaceOnce(
    source,
    "function MO(e){let t=(0,PO.c)(169),{align:n,",
    "function MO(e){let t=(0,PO.c)(169),{cdrChatMode:CDRChat,align:n,",
    "pass Chat mode into native picker",
  );
  source = replaceOnce(
    source,
    "(0,yk.jsx)(MO,{align:`end`,",
    "(0,yk.jsx)(MO,{cdrChatMode:CDRMode===`chat`,align:`end`,",
    "wire Chat mode to native picker",
  );
  const loadAnchor = "(async()=>{try{let client=null;try{client=o.get(V_)}";
  const loadReplacement = "(async()=>{try{if(!globalThis.__cdrEnsureChatClient){try{let transport=await import(`./" + chatAssetName + "`);if(typeof transport.Gn===`function`)transport.Gn()}catch(err){try{console.error(`[cdr] chat transport load`,err)}catch{}}}/* " + MARKER + ":lazy-transport */let client=null;try{client=o.get(V_)}";
  source = replaceOnce(source, loadAnchor, loadReplacement, "lazy-load Chat transport");
  // The removed HTML selector is intentionally left defined but unreachable;
  // keeping the helper avoids a broad minified-bundle rewrite.
  source = replaceOnce(
    source,
    "ee?null:CDRMode===`chat`?(0,yk.jsx)(CDRChatFlatSelector,{}):(0,yk.jsxs)(yk.Fragment,{children:",
    "ee?null:(0,yk.jsxs)(yk.Fragment,{children:",
    "restore native composer controls",
  );

  source = replaceOnce(
    source,
    "function CDRChatPowerSelections(){/* codex-rebuild:chat-models-v54:helpers */let rows=globalThis.__cdrChatPowerRows;if(Array.isArray(rows)&&rows.length)return rows;return[{id:`auto:none`,model:`auto`,modelLabel:`Auto`,reasoningEffort:`none`,powerSettingIndex:0}]}",
    "function CDRChatPowerSelections(){/* " + MARKER + ":no-invented-fallback */let rows=globalThis.__cdrChatPowerRows;return Array.isArray(rows)?rows:[]}",
    "remove synthetic Chat power fallback",
  );
  source = replaceOnce(
    source,
    "function CDRChatModelsForPicker(){let list=globalThis.__cdrChatPickerModels;if(Array.isArray(list)&&list.length)return list;return[{id:`auto`,model:`auto`,displayName:`Auto`,description:``,hidden:!1,supportedReasoningEfforts:[{reasoningEffort:`none`,description:`Auto`}],defaultReasoningEffort:`none`,isDefault:!0}]}",
    "function CDRChatModelsForPicker(){let list=globalThis.__cdrChatPickerModels;return Array.isArray(list)?list:[]}",
    "remove synthetic Chat model fallback",
  );

  source = replaceOnce(
    source,
    "T=S.model;r(ec,e);",
    "T=CDRMode===`chat`?(globalThis.__cdrChatSelectedModel||globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPowerRows?.[0]?.model||S.model):S.model;r(ec,e);/* " + MARKER + ":display-selection */",
    "display Chat selection without changing Codex state",
  );
  source = replaceOnce(
    source,
    "W=Ab(S.reasoningEffort,U),",
    "W=CDRMode===`chat`?`none`:Ab(S.reasoningEffort,U),",
    "hide Chat reasoning state",
  );

  const controllerLoop = "for (const controller of modelControllers) {";
  const controllerCount = source.split(controllerLoop).length - 1;
  assert(controllerCount >= 1, "mode controller loop missing");
  source = source.split(controllerLoop).join("if (next !== `chat`) for (const controller of modelControllers) {/* " + MARKER + ":preserve-codex-model */");

  const modeAnchor = "R=k===void 0?[]:k,t[0]=k,t[1]=R);let z=R,B=A===void 0?!1:A,ee=j===void 0?!0:j,V=M===void 0?!1:M,H=We(),";
  const modeReplacement =
    "R=k===void 0?[]:k,t[0]=k,t[1]=R);let z=R,B=A===void 0?!1:A,ee=j===void 0?!0:j,V=M===void 0?!1:M,H=We();" +
    "if(CDRChat){w=Array.isArray(globalThis.__cdrChatPowerRows)?globalThis.__cdrChatPowerRows:[];p=Array.isArray(globalThis.__cdrChatPickerModels)?globalThis.__cdrChatPickerModels:[];u=globalThis.__cdrChatSelectedModel||globalThis.__cdrChatDefaultSlug||w[0]?.model||``;T=`none`;ee=!1;P=p.length===0;y=(model)=>{globalThis.__cdrSelectChatModel?.(model)}}/* " + MARKER + ":native-picker-inputs */let ";
  source = replaceOnce(source, modeAnchor, modeReplacement, "supply native Chat picker inputs");

  const helperAnchor = "function CDRChatFlatSelector(){";
  const selectionHelper =
    "function CDRSelectChatModel(id){/* " + MARKER + ":selection */let rows=globalThis.__cdrChatPowerRows||[],hit=rows.find(row=>row.model===id);if(!hit)return;globalThis.__cdrChatSelectedModel=hit.model;try{localStorage.setItem(`cdr-chat-model-selection`,hit.model)}catch{}try{window.dispatchEvent(new CustomEvent(`cdr-chat-models-change`,{detail:{selectedModel:hit.model}}))}catch{}}globalThis.__cdrSelectChatModel=CDRSelectChatModel;";
  source = replaceOnce(source, helperAnchor, selectionHelper + helperAnchor, "install selection helper");

  return source;
}

function patchCatalog(source) {
  const oldBuilder = extractFunction(source, "function CDRMergeChatModels(e){");
  source = source.slice(0, oldBuilder.start) + CATALOG_BUILDER + source.slice(oldBuilder.end);
  source = replaceOnce(
    source,
    "return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))",
    "let CDRRaw=await this.request.getModelsResponse();try{globalThis.__cdrChatRawModels=Array.isArray(CDRRaw?.models)?CDRRaw.models:[]}catch{}return CDRMergeChatModels(Hn(CDRRaw))/* " + MARKER + ":raw-model-titles */",
    "retain authoritative raw model titles",
  );
  return source;
}

function patchSend(source, chatAssetName) {
  const old = extractFunction(source, "async function CDRStickyChatSend(e,t,n){");
  const bridge = BRIDGE.replace("__CDR_CHAT_ASSET__", chatAssetName);
  source = source.slice(0, old.start) + bridge + source.slice(old.end);
  const oldFallback = extractFunction(
    source,
    "function assertTaskLimitWithoutRuntime(threadKey) {",
  );
  return (
    source.slice(0, oldFallback.start) +
    assertTaskLimitWithoutRuntime.toString() +
    source.slice(oldFallback.end)
  );
}

function patchLocal(source) {
  const anchor = "V=(B&&B.at)?B.at(-1):null;";
  const effect = anchor + String.raw`(0,Tw.useEffect)(()=>{/* codex-rebuild:same-task-chat-v61:transcript */try{let textOf=value=>{if(value==null)return "";if(typeof value==="string")return value;if(Array.isArray(value))return value.map(textOf).filter(Boolean).join("\n");if(typeof value!=="object")return "";for(let key of ["text","content","message","agentMessage","userMessage","output_text"]){let found=textOf(value[key]);if(found)return found}return Array.isArray(value.parts)?textOf(value.parts):""},lines=[];for(let entry of Array.isArray(B)?B:[]){let turn=entry?.turn||entry,items=Array.isArray(turn?.items)?turn.items:[];for(let item of items){let body=textOf(item).trim();if(!body)continue;let role=item?.type==="userMessage"||item?.role==="user"?"User":"Assistant",line=role+": "+body;if(lines[lines.length-1]!==line)lines.push(line)}}if(!lines.length)return;let transcript=lines.join("\n\n---\n\n"),text="You are continuing an existing Codex task in Chat mode. The transcript below is authoritative prior conversation context. Continue naturally, preserve all decisions and constraints, and do not mention this handoff unless asked.\n\n<codex_transcript>\n"+transcript+"\n</codex_transcript>";globalThis.__cdrCodexContextByThread=globalThis.__cdrCodexContextByThread||{};globalThis.__cdrCodexContextByThread["local:"+e]={text,turnCount:lines.length,updatedAt:Date.now()}}catch{}},[e,B]);`;
  return replaceOnce(source, anchor, effect, "publish full Codex transcript");
}

function patchActionRow(source) {
  source = replaceOnce(
    source,
    "function iT(e){",
    TASK_USAGE_BADGE + "function iT(e){",
    "install task usage badge",
  );
  source = replaceOnce(
    source,
    "})}),a==null?null:(0,gT.jsx)(qy,{stats:a})",
    "})}),(0,gT.jsx)(CDRTaskUsageBadge,{threadId:y}),a==null?null:(0,gT.jsx)(qy,{stats:a})",
    "place task usage after feedback and fork controls",
  );
  parseOk("action row", source);
  return source;
}

function verify(catalog, settings, send, local, actions) {
  assert(catalog.includes(MARKER + ":authoritative-catalog"), "authoritative catalog builder missing");
  assert(catalog.includes(MARKER + ":raw-model-titles"), "raw model titles are not retained");
  assert(catalog.includes("const options = Array.isArray(e.options) ? e.options : []"), "active catalog options are not authoritative");
  assert(!catalog.includes("versions.flatMap"), "historical model options are still flattened");
  assert(settings.includes(MARKER + ":native-picker-inputs"), "native picker inputs missing");
  assert(settings.includes(MARKER + ":lazy-transport"), "Chat transport lazy-load missing");
  assert(settings.includes(MARKER + ":selection"), "Chat selection helper missing");
  assert(settings.includes(MARKER + ":display-selection"), "Chat trigger selection missing");
  assert(settings.includes(MARKER + ":preserve-codex-model"), "Chat still mutates Codex model state");
  assert(settings.includes(MARKER + ":no-invented-fallback"), "synthetic Chat model fallback remains");
  assert(settings.includes("const resolveKey = (store, threadKey, threadId)"), "task-limit aliases missing");
  assert(!settings.includes("cdr.chat.modelPicker.title"), "custom Chat menu styling remains");
  assert(!settings.includes("y(e.model,`none`)"), "Chat selection still writes through Codex model state");
  assert(!settings.includes("ee?null:CDRMode===`chat`?(0,yk.jsx)(CDRChatFlatSelector"), "HTML selector still rendered");
  assert(send.includes(MARKER + ":bridge"), "snapshot stream bridge missing");
  assert(send.includes("value?.aliases?.[rawKey] || rawKey"), "fallback task-limit aliases missing");
  assert(send.includes("message?.content?.parts"), "decoded snapshot parsing missing");
  assert(send.includes("conversation_id:conversationId||undefined"), "conversation continuation missing");
  assert(send.includes("parentMessageId:nextParent"), "parent message persistence missing");
  assert(!send.includes("assistant.slice(0,16000)"), "assistant truncation remains");
  assert(!send.includes("seed=history"), "synthetic truncated history remains");
  assert(local.includes(MARKER + ":transcript"), "Codex transcript publisher missing");
  assert(!local.includes("Middle of transcript omitted"), "transcript truncation remains");
  assert(actions.includes(MARKER + ":task-usage-badge"), "task usage badge missing");
  assert(actions.includes("CDRTaskUsageBadge,{threadId:y}"), "task usage badge is not beside actions");
  assert(actions.includes("totalTokens).toLocaleString()"), "exact task token total missing");
  assert(actions.includes("fiveHourDelta.toFixed(1)"), "task quota delta missing");
  parseOk("settings", settings);
  parseOk("catalog", catalog);
  parseOk("send", send);
  parseOk("local", local);
  parseOk("actions", actions);
}

async function main() {
  assert(fs.existsSync(BASE), `Missing base ASAR: ${BASE}`);
  if (!process.env.CDR_ASAR_ROOT) asar.extractAll(BASE, WORK);
  const settingsPath = asset(WORK, "unq8yzli");
  const catalogPath = asset(WORK, "nmo0zeut");
  const catalogName = path.basename(catalogPath);
  const sendPath = asset(WORK, "oxnpxkxc");
  const localPath = asset(WORK, "local-conversation-thread");
  const actionsPath = asset(WORK, "c33rimzq");
  const catalog = patchCatalog(fs.readFileSync(catalogPath, "utf8"));
  const settings = patchSettings(fs.readFileSync(settingsPath, "utf8"), catalogName);
  const send = patchSend(fs.readFileSync(sendPath, "utf8"), catalogName);
  const local = patchLocal(fs.readFileSync(localPath, "utf8"));
  const actions = patchActionRow(fs.readFileSync(actionsPath, "utf8"));
  verify(catalog, settings, send, local, actions);
  if (!process.argv.includes("--check")) {
    fs.writeFileSync(catalogPath, catalog);
    fs.writeFileSync(settingsPath, settings);
    fs.writeFileSync(sendPath, send);
    fs.writeFileSync(localPath, local);
    fs.writeFileSync(actionsPath, actions);
  }
  if (process.argv.includes("--pack")) {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    await asar.createPackage(WORK, OUTPUT);
    console.log(`v61 packed ${OUTPUT}`);
  } else {
    console.log(process.argv.includes("--check") ? "v61 check ok" : `v61 patched ${WORK}`);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.stack || error);
    process.exitCode = 1;
  });
}

module.exports = { BRIDGE, CATALOG_BUILDER, TASK_USAGE_BADGE, patchActionRow, patchCatalog, patchLocal, patchSend, patchSettings, verify };
