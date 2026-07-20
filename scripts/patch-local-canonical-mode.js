#!/usr/bin/env node
"use strict";

/**
 * Add Chat / Work / Codex presets to local tasks without changing routes,
 * task identity, transcript ownership, sidebar state, or transport.
 *
 * All three presets continue through the native AppServer composer. A mode
 * switch changes only the selected preset, the effective model, and the send
 * button color.
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { SRC_DIR, relPath } = require("./patch-util");

const SUPPORTED_PLATFORM = "mac-x64";
const SELECTOR_MARKER = "codex-rebuild:local-canonical-selector-v3";
const COMPOSER_MARKER = "codex-rebuild:local-canonical-composer-v5";
const MODEL_PICKER_MARKER = "codex-rebuild:local-canonical-model-picker-v5";
const SEND_MARKER = "codex-rebuild:local-canonical-send-v3";
const CONTEXT_MARKER = "codex-rebuild:luna-light-context-v1";
const RESUME_CONTEXT_MARKER = "codex-rebuild:luna-light-resume-context-v1";
const CSS_MARKER = "codex-rebuild:local-canonical-colors-v3";
const STORE_KEY = "cdr-product-mode";
const EVENT_NAME = "cdr-local-mode-change";

function installLocalModeRuntime() {
  if (globalThis.__cdrLocalModeV4) return globalThis.__cdrLocalModeV4;

  const storeKey = "cdr-product-mode";
  const eventName = "cdr-local-mode-change";
  const validModes = new Set(["chat", "work", "codex"]);
  const modelControllers = new Set();
  const presetSettings = Object.freeze({
    chat: Object.freeze({
      model: "auto",
      reasoningEffort: "medium",
    }),
    work: Object.freeze({
      model: "gpt-5.6-terra",
      reasoningEffort: "low",
    }),
    codex: Object.freeze({
      model: "gpt-5.6-sol",
      reasoningEffort: "high",
    }),
  });
  const normalize = (value, fallback = "codex") =>
    validModes.has(value)
      ? value
      : validModes.has(fallback)
        ? fallback
        : "codex";
  const mode = (fallback = "codex") => {
    try {
      return normalize(localStorage.getItem(storeKey), fallback);
    } catch {
      return normalize(null, fallback);
    }
  };
  const applyRoot = (value) => {
    try {
      document.documentElement.setAttribute(
        "data-codex-product-mode",
        normalize(value),
      );
    } catch {}
  };
  const setMode = (value) => {
    const next = normalize(value);
    try {
      localStorage.setItem(storeKey, next);
    } catch {}
    applyRoot(next);
    for (const controller of modelControllers) {
      try {
        let CDRApply=presetSettings[next];if(next===`chat`){try{let slug=globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPickerModels?.[0]?.model;if(slug){let hit=(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===slug);CDRApply={model:slug,reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`}}}catch{}}const result = controller(CDRApply);
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {}
    }
    try {
      window.dispatchEvent(
        new CustomEvent(eventName, { detail: Object.freeze({ mode: next }) }),
      );
    } catch {}
    return next;
  };
  const subscribe = (listener) => {
    const onMode = (event) => listener(normalize(event?.detail?.mode));
    try {
      window.addEventListener(eventName, onMode);
      return () => window.removeEventListener(eventName, onMode);
    } catch {
      return () => {};
    }
  };
  const settingsForMode = (value) => presetSettings[normalize(value)];
  const modelForMode = (value) => settingsForMode(value).model;
  const reasoningEffortForMode = (value) =>
    settingsForMode(value).reasoningEffort;
  const registerModelController = (controller) => {
    if (typeof controller !== "function") return () => {};
    modelControllers.add(controller);
    return () => modelControllers.delete(controller);
  };
  const backgroundModel = "gpt-5.6-luna";
  const backgroundReasoningEffort = "low";
  const collaborationForMode = (value, collaboration) => {
    if (!collaboration || typeof collaboration !== "object") {
      return collaboration;
    }
    const { model, reasoningEffort } = settingsForMode(value);
    if (
      collaboration.settings?.model === model &&
      collaboration.settings?.reasoning_effort === reasoningEffort
    ) {
      return collaboration;
    }
    return {
      ...collaboration,
      settings: {
        ...(collaboration.settings || {}),
        model,
        reasoning_effort: reasoningEffort,
      },
    };
  };
  const backgroundCollaboration = (collaboration) => {
    if (!collaboration || typeof collaboration !== "object") {
      return collaboration;
    }
    if (
      collaboration.settings?.model === backgroundModel &&
      collaboration.settings?.reasoning_effort === backgroundReasoningEffort
    ) {
      return collaboration;
    }
    return {
      ...collaboration,
      settings: {
        ...(collaboration.settings || {}),
        model: backgroundModel,
        reasoning_effort: backgroundReasoningEffort,
      },
    };
  };

  const initialMode = mode();
  applyRoot(initialMode);
  globalThis.__cdrLocalModeV4 = Object.freeze({
    backgroundCollaboration,
    backgroundModel,
    backgroundReasoningEffort,
    collaborationForMode,
    eventName,
    mode,
    modelForMode,
    presetSettings,
    reasoningEffortForMode,
    registerModelController,
    setMode,
    settingsForMode,
    storeKey,
    subscribe,
  });
  return globalThis.__cdrLocalModeV4;
}

const RUNTIME_SOURCE = `(${installLocalModeRuntime.toString()})()`;

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value?.type) {
      walk(value, visitor);
    }
  }
}

function parseBundle(source, filePath) {
  try {
    return parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${relPath(filePath)} failed to parse: ${error.message}`);
  }
}

function findFunction(source, filePath, needles, ast = null) {
  const matches = [];
  walk(ast || parseBundle(source, filePath), (node) => {
    if (node.type !== "FunctionDeclaration") return;
    const text = source.slice(node.start, node.end);
    if (needles.every((needle) => text.includes(needle))) matches.push(node);
  });
  if (matches.length !== 1) {
    throw new Error(
      `${relPath(filePath)} expected one function for ${needles[0]}, found ${matches.length}`,
    );
  }
  return matches[0];
}

function replaceFunction(source, node, replacement) {
  return source.slice(0, node.start) + replacement + source.slice(node.end);
}

function replaceOne(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected one anchor, found ${count}`);
  }
  return source.replace(needle, replacement);
}

function patchSelectorBundle(source, filePath) {
  if (source.includes(SELECTOR_MARKER)) {
    verifySelectorBundle(source, filePath);
    return source;
  }

  const ast = parseBundle(source, filePath);
  const selectorNode = findFunction(source, filePath, [
    "sidebarElectron.productMode.trigger",
    "sidebarElectron.productMode.work.description.recommended",
    "sidebarElectron.productMode.codex.description.developer",
  ], ast);
  let selector = source.slice(selectorNode.start, selectorNode.end);
  selector = replaceOne(
    selector,
    "s=i===`work`?",
    "s=i===`chat`?(0,TG.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:`Chat`}):i===`work`?",
    "Chat selector label",
  );
  selector = replaceOne(
    selector,
    "children:n?(0,TG.jsx)(Y,{...EG.chatGpt}):(0,TG.jsx)(Y,{...EG.work})",
    "children:`ChatGPT Work`",
    "ChatGPT Work trigger label",
  );
  selector = replaceOne(
    selector,
    "e=i===`codex`?o.formatMessage(EG.codex):n?o.formatMessage(EG.chatGpt):o.formatMessage(EG.work)",
    "e=i===`chat`?`Chat`:i===`work`?`ChatGPT Work`:o.formatMessage(EG.codex)",
    "Chat selector accessible label",
  );
  selector = replaceOne(
    selector,
    "children:n?(0,TG.jsx)(Y,{...EG.chatGpt}):(0,TG.jsx)(Y,{id:`sidebarElectron.productMode.chatGptWork.unavailable`,defaultMessage:`ChatGPT Work`,description:`ChatGPT Work option in the sidebar mode selector when ChatGPT features are unavailable`})",
    "children:`ChatGPT Work`",
    "ChatGPT Work menu label",
  );
  selector = replaceOne(
    selector,
    "let w=i===`codex`?Dr:void 0",
    "let CDRChatRight=i===`chat`?Dr:void 0,CDRChatItem=(0,TG.jsx)(VO.Item,{className:`py-2.5 text-base`,RightIcon:CDRChatRight,SubText:(0,TG.jsx)(`span`,{className:`text-token-description-foreground`,children:`Chat preset — same task and history`}),onSelect:()=>a(`chat`),children:(0,TG.jsx)(`span`,{className:`font-openai-sans`,children:`Chat`})});let w=i===`codex`?Dr:void 0",
    "Chat selector item",
  );
  selector = replaceOne(
    selector,
    "children:[C,O]",
    "children:[C,CDRChatItem,O]",
    "Chat selector menu",
  );
  selector = selector.replace(
    /^function ([A-Za-z_$][\w$]*)\(e\)\{/,
    (match) => `${match}/* ${SELECTOR_MARKER} */`,
  );
  const controllerNode = findFunction(source, filePath, [
    "codexFeaturesAllowed",
    "productMode",
    "chatGptFeaturesAllowed",
    "startNewConversation",
  ], ast);
  let controller = source.slice(controllerNode.start, controllerNode.end);
  controller = controller.replace(
    /^function ([A-Za-z_$][\w$]*)\(e\)\{/,
    (match) =>
      `${match}let CDRRuntime=${RUNTIME_SOURCE},[CDRMode,CDRSetMode]=(0,BI.useState)(()=>CDRRuntime.mode(\`codex\`));`,
  );
  controller = replaceOne(
    controller,
    "c=p(zT)===`allowed`,l=!n,u;",
    "c=p(zT)===`allowed`,l=!n,u;(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:sticky-chat-v43:durable-sync */if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);",
    "Keep native surface on codex so /local sticky history stays",
  );
  controller = replaceOne(
    controller,
    "t[0]!==a||t[1]!==r||t[2]!==i||t[3]!==s?(u=e=>{sae(i,{currentMode:r,navigate:a,nextMode:e,startNewConversation:s})},t[0]=a,t[1]=r,t[2]=i,t[3]=s,t[4]=u):u=t[4];",
    "u=e=>{/* codex-rebuild:sticky-chat-v43:durable-mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};",
    "Sticky presets: mode switch only flips CDR sticky mode",
  );
  controller = replaceOne(
    controller,
    "t[5]!==c||t[6]!==r||t[7]!==l||t[8]!==u",
    "t[5]!==c||t[6]!==CDRMode||t[7]!==l||t[8]!==u",
    "mode controller memo dependency",
  );
  controller = replaceOne(
    controller,
    "mode:r,onModeSelect:u",
    "mode:CDRMode,onModeSelect:u",
    "mode controller prop",
  );
  controller = replaceOne(
    controller,
    "t[5]=c,t[6]=r,t[7]=l,t[8]=u",
    "t[5]=c,t[6]=CDRMode,t[7]=l,t[8]=u",
    "mode controller memo assignment",
  );
  let next = source;
  for (const { node, replacement } of [
    { node: selectorNode, replacement: selector },
    { node: controllerNode, replacement: controller },
  ].sort((left, right) => right.node.start - left.node.start)) {
    next = replaceFunction(next, node, replacement);
  }
  verifySelectorBundle(next, filePath);
  return next;
}

function patchComposerBundle(source, filePath) {
  if (source.includes(COMPOSER_MARKER)) {
    verifyComposerBundle(source, filePath);
    return source;
  }

  const ast = parseBundle(source, filePath);
  const composerNode = findFunction(source, filePath, [
    "activeCollaborationMode",
    "setSelectedCollaborationMode",
    "settings.model",
    "collaborationMode:i",
  ], ast);
  let composer = source.slice(composerNode.start, composerNode.end);
  composer = composer.replace(
    /^function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
    (match) =>
      `${match}/* ${COMPOSER_MARKER} */let CDRRuntime=${RUNTIME_SOURCE},[CDRMode,CDRSetMode]=(0,vW.useState)(()=>CDRRuntime.mode());(0,vW.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);i=CDRRuntime.collaborationForMode(CDRMode,i);let CDRBackground=CDRRuntime.backgroundCollaboration(i);`,
  );
  const resumeStart = composer.indexOf("hs=async(e,t,n)=>");
  const resumeEnd = composer.indexOf("},gs=async e=>", resumeStart);
  if (resumeStart < 0 || resumeEnd < 0) {
    throw new Error(`${relPath(filePath)} background resume handler changed`);
  }
  let resume = composer.slice(resumeStart, resumeEnd + 1);
  resume = replaceOne(
    resume,
    "let r=await is(t,n,e);",
    `/* ${RESUME_CONTEXT_MARKER} */let r=await is(t,CDRBackground,e);`,
    "Luna Light resume context",
  );
  resume = replaceOne(
    resume,
    "model:null,serviceTier:c,reasoningEffort:null",
    "model:CDRRuntime.backgroundModel,serviceTier:c,reasoningEffort:CDRRuntime.backgroundReasoningEffort",
    "Luna Light resume request",
  );
  resume = replaceOne(
    resume,
    "collaborationMode:r.collaborationMode??i",
    "collaborationMode:CDRBackground",
    "Luna Light resume collaboration mode",
  );
  const resumeModeCount = countOccurrences(
    resume,
    "activeCollaborationMode:i",
  );
  if (resumeModeCount !== 2) {
    throw new Error(
      `${relPath(filePath)} expected two resume context calls, found ${resumeModeCount}`,
    );
  }
  resume = resume.replaceAll(
    "activeCollaborationMode:i",
    "activeCollaborationMode:CDRBackground",
  );
  composer =
    composer.slice(0, resumeStart) +
    resume +
    composer.slice(resumeEnd + 1);
  const modelPickerNode = findFunction(source, filePath, [
    "setModelAndReasoningEffort",
    "composer.modelChangeDuringConversationWarning.toast",
    "modelPickerTriggerConfig",
  ], ast);
  let modelPicker = source.slice(modelPickerNode.start, modelPickerNode.end);
  modelPicker = modelPicker.replace(
    /^function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
    (match) =>
      `${match}/* ${MODEL_PICKER_MARKER} */let CDRRuntime=${RUNTIME_SOURCE};`,
  );
  modelPicker = replaceOne(
    modelPicker,
    "(0,_k.useEffect)(()=>{},[!1,S.model,S.reasoningEffort,T,w]);",
    "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);",
    "native model picker synchronization",
  );
  const sendNode = findFunction(source, filePath, [
    "ariaLabel",
    "blockedReasonOpenNonce",
    "fullBleedIcon",
    "Fe=D===`stop`",
  ], ast);
  let send = source.slice(sendNode.start, sendNode.end);
  send = replaceOne(
    send,
    ":(0,$.jsx)(Hg,{ariaLabel:",
    `:(0,$.jsx)(Hg,{className:\`cdr-mode-send\`,/* ${SEND_MARKER} */ariaLabel:`,
    "send button class",
  );
  let next = source;
  for (const { node, replacement } of [
    { node: composerNode, replacement: composer },
    { node: modelPickerNode, replacement: modelPicker },
    { node: sendNode, replacement: send },
  ].sort((left, right) => right.node.start - left.node.start)) {
    next = replaceFunction(next, node, replacement);
  }
  verifyComposerBundle(next, filePath);
  return next;
}

function patchContextBundle(source, filePath) {
  if (source.includes(CONTEXT_MARKER)) {
    verifyContextBundle(source, filePath);
    return source;
  }
  const handoffNode = findFunction(source, filePath, [
    "ChatGPT conversation does not have a server id",
    "chatGptConversationContexts",
    "model:void 0",
    "thinking:void 0",
  ]);
  let handoff = source.slice(handoffNode.start, handoffNode.end);
  handoff = handoff.replace(
    /^async function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
    (match) => `${match}/* ${CONTEXT_MARKER} */`,
  );
  handoff = replaceOne(
    handoff,
    "model:void 0",
    "model:`gpt-5.6-luna`",
    "ChatGPT context handoff model",
  );
  handoff = replaceOne(
    handoff,
    "thinking:void 0",
    "thinking:`low`",
    "ChatGPT context handoff effort",
  );
  const next = replaceFunction(source, handoffNode, handoff);
  verifyContextBundle(next, filePath);
  return next;
}

function patchCss(source, filePath) {
  if (source.includes(CSS_MARKER)) {
    verifyCss(source, filePath);
    return source;
  }
  const next =
    source +
    `\n/* ${CSS_MARKER} */\n` +
    `:root[data-codex-product-mode="chat"] .cdr-mode-send{background-color:#111111!important;border-color:#111111!important;color:#fff!important}\n` +
    `:root[data-codex-product-mode="work"] .cdr-mode-send{background-color:#2563eb!important;border-color:#2563eb!important;color:#fff!important}\n` +
    `:root[data-codex-product-mode="codex"] .cdr-mode-send{background-color:#dc2626!important;border-color:#dc2626!important;color:#fff!important}\n`;
  verifyCss(next, filePath);
  return next;
}

function verifySelectorBundle(source, filePath) {
  for (const needle of [
    SELECTOR_MARKER,
    "codex-rebuild:sticky-chat-v43:durable-mode",
    "codex-rebuild:sticky-chat-v43:durable-sync",
    "CDRRuntime.setMode(e)",
    "mode:CDRMode",
    "CDRChatItem",
    "children:`ChatGPT Work`",
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  const ast = parseBundle(source, filePath);
  const controllerNode = findFunction(source, filePath, [
    "codexFeaturesAllowed",
    "productMode",
    "CDRRuntime.setMode",
  ], ast);
  const controller = source.slice(controllerNode.start, controllerNode.end);
  for (const forbidden of [
    "window.location",
    "location.reload",
    "/work/conversation/",
    "if(r!==`codex`)sae",
  ]) {
    if (controller.includes(forbidden)) {
      throw new Error(
        `${relPath(filePath)} controller still performs ${forbidden}`,
      );
    }
  }
  if (countOccurrences(controller, "sae(") < 1) {
    throw new Error(
      `${relPath(filePath)} must keep native surface on codex via sae`,
    );
  }
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function verifyComposerBundle(source, filePath) {
  for (const needle of [
    COMPOSER_MARKER,
    MODEL_PICKER_MARKER,
    SEND_MARKER,
    "CDRRuntime.subscribe(CDRSetMode)",
    "CDRRuntime.collaborationForMode(CDRMode,i)",
    "CDRRuntime.backgroundCollaboration(i)",
    "CDRRuntime.registerModelController",
    RESUME_CONTEXT_MARKER,
    "model:CDRRuntime.backgroundModel",
    "reasoningEffort:CDRRuntime.backgroundReasoningEffort",
    "collaborationMode:CDRBackground",
    "activeCollaborationMode:CDRBackground",
    "w(CDRModel,CDREffort)",
    "className:`cdr-mode-send`",
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  parseBundle(source, filePath);
}

function verifyContextBundle(source, filePath) {
  for (const needle of [
    CONTEXT_MARKER,
    "model:`gpt-5.6-luna`",
    "thinking:`low`",
    "chatGptConversationContexts",
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  parseBundle(source, filePath);
}

function verifyCss(source, filePath) {
  for (const needle of [
    CSS_MARKER,
    'data-codex-product-mode="chat"',
    'data-codex-product-mode="work"',
    'data-codex-product-mode="codex"',
    "#111111",
    "#2563eb",
    "#dc2626",
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
}

function locateTargets(platform) {
  if (platform !== SUPPORTED_PLATFORM) {
    throw new Error(
      `Local canonical mode supports only ${SUPPORTED_PLATFORM} 26.715.31925; got ${platform}`,
    );
  }
  const assets = path.join(SRC_DIR, platform, "_asar", "webview", "assets");
  if (!fs.existsSync(assets)) {
    throw new Error(`${platform}: webview assets missing`);
  }
  const names = fs.readdirSync(assets);
  const jsFiles = names
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assets, name));
  const matchOne = (label, files, predicate) => {
    const matches = files.filter((filePath) =>
      predicate(fs.readFileSync(filePath, "utf8")),
    );
    if (matches.length !== 1) {
      throw new Error(
        `${platform}: expected one ${label} bundle, found ${matches.length}`,
      );
    }
    return matches[0];
  };
  const selector = matchOne(
    "product selector",
    jsFiles,
    (source) =>
      source.includes("sidebarElectron.productMode.trigger") &&
      source.includes("sidebarElectron.productMode.codex.description.developer") &&
      source.includes("startNewConversation"),
  );
  const composer = matchOne(
    "local composer",
    jsFiles,
    (source) =>
      source.includes("activeCollaborationMode") &&
      source.includes("setSelectedCollaborationMode") &&
      source.includes("blockedReasonOpenNonce") &&
      source.includes("settings.model"),
  );
  const context = matchOne(
    "ChatGPT context handoff",
    jsFiles,
    (source) =>
      source.includes("ChatGPT conversation does not have a server id") &&
      source.includes("chatGptConversationContexts") &&
      (source.includes("thinking:void 0") || source.includes(CONTEXT_MARKER)),
  );
  const history = matchOne(
    "full background history hydration",
    jsFiles,
    (source) =>
      source.includes("hydrate-background-threads") &&
      source.includes("subagent summary previews") &&
      source.includes("includeTurns:!0"),
  );
  const threadContext = matchOne(
    "full referenced-thread context",
    jsFiles,
    (source) =>
      source.includes("excludedThreadId") &&
      source.includes("priorConversation") &&
      source.includes("method:`thread/read`") &&
      source.includes("includeTurns:!0"),
  );
  const cssFiles = names
    .filter((name) => /^app-[^.]+\.css$/.test(name))
    .map((name) => path.join(assets, name));
  const css = matchOne(
    "main stylesheet",
    cssFiles,
    (source) =>
      source.includes("--color-token-main-surface-primary") &&
      source.includes(".bg-token-main-surface-primary"),
  );
  return { composer, context, css, history, selector, threadContext };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const platform =
    args.find((arg) => ["mac-x64", "mac-arm64", "win"].includes(arg)) ||
    SUPPORTED_PLATFORM;
  const targets = locateTargets(platform);
  const patches = [
    ["selector", patchSelectorBundle],
    ["composer", patchComposerBundle],
    ["context", patchContextBundle],
    ["css", patchCss],
  ].map(([key, patcher]) => {
    const filePath = targets[key];
    const source = fs.readFileSync(filePath, "utf8");
    return { filePath, next: patcher(source, filePath), source };
  });

  if (checkOnly) {
    console.log(
      `  [ok] ${platform}: local canonical modes are ${
        patches.every((patch) => patch.next === patch.source)
          ? "installed"
          : "patchable"
      }`,
    );
    return;
  }
  for (const patch of patches) {
    if (patch.next !== patch.source) {
      fs.writeFileSync(patch.filePath, patch.next);
    }
  }
  console.log(
    `  [ok] ${platform}: installed in-task Chat / Work / Codex presets`,
  );
}

module.exports = {
  CSS_MARKER,
  CONTEXT_MARKER,
  EVENT_NAME,
  MODEL_PICKER_MARKER,
  RESUME_CONTEXT_MARKER,
  STORE_KEY,
  installLocalModeRuntime,
  locateTargets,
  patchComposerBundle,
  patchContextBundle,
  patchCss,
  patchSelectorBundle,
  verifyComposerBundle,
  verifyContextBundle,
  verifyCss,
  verifySelectorBundle,
};

if (require.main === module) main();

// codex-rebuild:chat-models-v37: Chat mode picker loads ChatGPT /models via scripts/_apply-chat-models-v37.js

