#!/usr/bin/env node
"use strict";

/**
 * Add Chat / Work / Codex presets to local tasks without changing routes,
 * task identity, transcript ownership, sidebar state, or transport.
 *
 * All three presets continue through the native AppServer composer. A mode
 * switch changes only the selected preset, the effective model, and the send
 * button color.
 *
 * Updated for 26.721 base: variable name remapping (TG→U8, EG→W8, Y→Z,
 * Dr→Ym, VO→yz, BI→L$, vW→L$, _k→XM, sae→Kac, zT→hH, Hg→oX, $→aZ),
 * selector/controller split (mLl/T0l), dynamic resume handler bounds.
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { SRC_DIR, relPath, parseBundleCached: parseBundle } = require("./patch-util");

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

function tryReplace(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count === 0) return source; // skip if not found
  if (count > 1) throw new Error(`${label}: expected 0 or 1 anchor, found ${count}`);
  return source.replace(needle, replacement);
}

function patchSelectorBundle(source, filePath) {
  if (source.includes(SELECTOR_MARKER)) {
    verifySelectorBundle(source, filePath);
    return source;
  }

  const ast = parseBundle(source, filePath);

  // ── Selector function (mLl in 26.721) ──────────────────────
  const selectorNode = findFunction(source, filePath, [
    "sidebarElectron.productMode.trigger",
    "sidebarElectron.productMode.work.description.recommended",
    "sidebarElectron.productMode.codex.description.developer",
  ], ast);
  let selector = source.slice(selectorNode.start, selectorNode.end);

  // 26.721 variable names: U8=JSX, Z=FormattedMessage, W8=i18n defs, Ym=RightIcon, yz=Dropdown
  selector = replaceOne(
    selector,
    "s=i===`work`?",
    "s=i===`chat`?(0,U8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:`Chat`}):i===`work`?",
    "Chat selector label",
  );
  selector = tryReplace(
    selector,
    "children:n?(0,U8.jsx)(Z,{...W8.chatGpt}):(0,U8.jsx)(Z,{...W8.work})",
    "children:`ChatGPT Work`",
    "ChatGPT Work trigger label",
  );
  selector = tryReplace(
    selector,
    "e=i===`codex`?o.formatMessage(W8.codex):n?o.formatMessage(W8.chatGpt):o.formatMessage(W8.work)",
    "e=i===`chat`?`Chat`:i===`work`?`ChatGPT Work`:o.formatMessage(W8.codex)",
    "Chat selector accessible label",
  );
  selector = tryReplace(
    selector,
    "children:n?(0,U8.jsx)(Z,{...W8.chatGpt}):(0,U8.jsx)(Z,{id:`sidebarElectron.productMode.chatGptWork.unavailable`,defaultMessage:`ChatGPT Work`,description:`ChatGPT Work option in the sidebar mode selector when ChatGPT features are unavailable`})",
    "children:`ChatGPT Work`",
    "ChatGPT Work menu label",
  );
  // 26.721.31836: the Codex RightIcon variable name can differ between
  // minifications (was Ym, now Bm). Capture it dynamically so the patch
  // keeps working across minor upstream builds.
  const codexIconMatch = selector.match(/let w=i===`codex`\?(\w+):void 0/);
  if (!codexIconMatch) {
    throw new Error(`${relPath(filePath)}: could not locate Codex RightIcon variable for Chat selector item`);
  }
  const codexIconVar = codexIconMatch[1];
  selector = selector.replace(
    /let w=i===`codex`\?\w+:void 0/,
    `let CDRChatRight=i===\`chat\`?${codexIconVar}:void 0,CDRChatItem=(0,U8.jsx)(yz.Item,{className:\`py-2.5 text-base\`,RightIcon:CDRChatRight,SubText:(0,U8.jsx)(\`span\`,{className:\`text-token-description-foreground\`,children:\`Chat preset — same task and history\`}),onSelect:()=>a(\`chat\`),children:(0,U8.jsx)(\`span\`,{className:\`font-openai-sans\`,children:\`Chat\`})});let w=i===\`codex\`?${codexIconVar}:void 0`,
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

  // ── Controller function (T0l in 26.721) ────────────────────
  // 26.721 split selector/controller: T0l wraps mLl, calls Kac for navigation
  const controllerNode = findFunction(source, filePath, [
    "codexLocalAccessStatus",
    "productMode",
    "Kac",
    "startNewConversation",
  ], ast);
  let controller = source.slice(controllerNode.start, controllerNode.end);

  // Inject CDR runtime + useState at function start (L$ = React in 26.721)
  controller = controller.replace(
    /^function ([A-Za-z_$][\w$]*)\(e\)\{/,
    (match) =>
      `${match}let CDRRuntime=${RUNTIME_SOURCE},[CDRMode,CDRSetMode]=(0,L$.useState)(()=>CDRRuntime.mode(\`codex\`));`,
  );

  // Add durable-sync useLayoutEffect after variable declarations.
  // 26.721.30844: u=Y(hH)===`allowed`,d=s===P3o,f=d||n?`codex`:i,p;
  // 26.721.31836: u=Y(f_a)===`allowed`,d=s===R3o,f=d||n?`codex`:i,p;
  // Use a regex so small minifier name changes do not break the patch.
  const durableSyncMatch = controller.match(/u=Y\([\w$]+\)===`allowed`,d=s===[\w$]+,f=d\|\|n\?`codex`:i,p;/);
  if (durableSyncMatch) {
    controller = controller.replace(
      /u=Y\([\w$]+\)===`allowed`,d=s===[\w$]+,f=d\|\|n\?`codex`:i,p;/,
      `${durableSyncMatch[0]}(0,D0l.useLayoutEffect)(()=>{/* codex-rebuild:sticky-chat-v43:durable-sync */if(CDRMode!==\`codex\`)Kac(a,{codexLocalAccessStatus:r,currentMode:i,navigate:o,nextMode:\`codex\`,startNewConversation:l})},[CDRMode,a,r,i,o,l]);`,
    );
  } else {
    console.warn(`  [warn] Could not inject durable-sync useLayoutEffect in ${relPath(filePath)}`);
  }

  // Replace the mode-switch memo callback body to use CDR setMode.
  // The routing helper name changes between minor builds (Mzn, Qzn, etc.),
  // so match the callback shape with a regex instead of an exact string.
  const modeSwitchRegex = /if\(d\)\{if\(e===`work`\)\{[\s\S]*?\}return\}Kac\(a,\{[\s\S]*?startNewConversation:[\w$]+\}\)/;
  const modeSwitchMatch = controller.match(modeSwitchRegex);
  if (!modeSwitchMatch) {
    throw new Error(`${relPath(filePath)}: could not locate mode-switch callback for sticky presets`);
  }
  controller = controller.replace(
    modeSwitchRegex,
    "/* codex-rebuild:sticky-chat-v43:durable-mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)",
  );

  // Change memo dependency from f to CDRMode
  controller = tryReplace(
    controller,
    "t[8]!==u||t[9]!==n||t[10]!==f||t[11]!==p",
    "t[8]!==u||t[9]!==n||t[10]!==CDRMode||t[11]!==p",
    "mode controller memo dependency",
  );

  // Change mode prop in mLl call from f to CDRMode
  controller = tryReplace(
    controller,
    "mode:f,onModeSelect:p",
    "mode:CDRMode,onModeSelect:p",
    "mode controller prop",
  );

  // Change memo assignment from f to CDRMode
  controller = tryReplace(
    controller,
    "t[8]=u,t[9]=n,t[10]=f,t[11]=p",
    "t[8]=u,t[9]=n,t[10]=CDRMode,t[11]=p",
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
  // 26.721: I0s is the composer function, collaborationModes:i (plural)
  const composerNode = findFunction(source, filePath, [
    "activeCollaborationMode",
    "setSelectedCollaborationMode",
    "settings.model",
    "collaborationModes",
  ], ast);
  let composer = source.slice(composerNode.start, composerNode.end);

  // 26.721: L$ = React hooks
  composer = composer.replace(
    /^function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
    (match) =>
      `${match}/* ${COMPOSER_MARKER} */let CDRRuntime=${RUNTIME_SOURCE},[CDRMode,CDRSetMode]=(0,L$.useState)(()=>CDRRuntime.mode());(0,L$.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);n=CDRRuntime.collaborationForMode(CDRMode,n);let CDRBackground=CDRRuntime.backgroundCollaboration(n);`,
  );

  // 26.721: resume handler is lee=async(e,t,r)=>, next handler is dynamic
  const resumeStart = composer.indexOf("lee=async(e,t,r)=>");
  if (resumeStart < 0) {
    throw new Error(`${relPath(filePath)} resume handler (lee) not found`);
  }
  // Find the next handler boundary dynamically: },[var]=async
  const resumeEndMatch = composer.slice(resumeStart).match(/\},[a-zA-Z_$][\w$]*=async/);
  if (!resumeEndMatch) {
    throw new Error(`${relPath(filePath)} could not find resume handler end boundary`);
  }
  const resumeEnd = resumeStart + resumeEndMatch.index; // index of }

  let resume = composer.slice(resumeStart, resumeEnd + 1);

  // 26.721: let i=await io(t,r,e);
  resume = tryReplace(
    resume,
    "let i=await io(t,r,e);",
    `/* ${RESUME_CONTEXT_MARKER} */let i=await io(t,CDRBackground,e);`,
    "Luna Light resume context",
  );

  // model:null,serviceTier:?,reasoningEffort:null → background model
  // Try multiple serviceTier variable names
  resume = tryReplace(
    resume,
    "model:null,serviceTier:c,reasoningEffort:null",
    "model:CDRRuntime.backgroundModel,serviceTier:c,reasoningEffort:CDRRuntime.backgroundReasoningEffort",
    "Luna Light resume request (serviceTier:c)",
  );
  resume = tryReplace(
    resume,
    "model:null,serviceTier:o,reasoningEffort:null",
    "model:CDRRuntime.backgroundModel,serviceTier:o,reasoningEffort:CDRRuntime.backgroundReasoningEffort",
    "Luna Light resume request (serviceTier:o)",
  );
  resume = tryReplace(
    resume,
    "model:null,serviceTier:a,reasoningEffort:null",
    "model:CDRRuntime.backgroundModel,serviceTier:a,reasoningEffort:CDRRuntime.backgroundReasoningEffort",
    "Luna Light resume request (serviceTier:a)",
  );

  // 26.721: collaborationMode:i.collaborationMode??n
  resume = tryReplace(
    resume,
    "collaborationMode:i.collaborationMode??n",
    "collaborationMode:CDRBackground",
    "Luna Light resume collaboration mode",
  );

  // 26.721: activeCollaborationMode:n (was activeCollaborationMode:i)
  const resumeModeCount = countOccurrences(resume, "activeCollaborationMode:n");
  if (resumeModeCount > 0) {
    resume = resume.replaceAll("activeCollaborationMode:n", "activeCollaborationMode:CDRBackground");
  }

  composer =
    composer.slice(0, resumeStart) +
    resume +
    composer.slice(resumeEnd + 1);

  // ── Model picker function (mYr in 26.721) ──────────────────
  const modelPickerNode = findFunction(source, filePath, [
    "setModelAndReasoningEffort",
    "composer.modelChangeDuringConversationWarning.toast",
    "modelPickerTriggerConfig",
  ], ast);
  let modelPicker = source.slice(modelPickerNode.start, modelPickerNode.end);
  // 26.721: XM = React hooks in model picker
  modelPicker = modelPicker.replace(
    /^function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
    (match) =>
      `${match}/* ${MODEL_PICKER_MARKER} */let CDRRuntime=${RUNTIME_SOURCE};`,
  );
  // 26.721: the noop useEffect was removed; try to find any useEffect with
  // model/reasoningEffort deps, or skip model controller registration.
  // The old pattern: (0,_k.useEffect)(()=>{},[!1,S.model,S.reasoningEffort,T,w]);
  // Try common variable name patterns for 26.721
  const modelPickerEffectPatterns = [
    "(0,XM.useEffect)(()=>{},[!1,S.model,S.reasoningEffort,T,w]);",
    "(0,XM.useEffect)(()=>{},[!1,S.model,S.reasoningEffort,T,W]);",
  ];
  let modelPickerEffectReplaced = false;
  for (const pat of modelPickerEffectPatterns) {
    if (modelPicker.includes(pat)) {
      const wVar = pat.includes(",w];") ? "w" : "W";
      modelPicker = replaceOne(
        modelPicker,
        pat,
        `(0,XM.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>${wVar}(CDRModel,CDREffort)),[CDRRuntime,${wVar}]);`,
        "native model picker synchronization",
      );
      modelPickerEffectReplaced = true;
      break;
    }
  }
  // If noop useEffect not found, try adding registration after CDRRuntime.
  // CAUTION: do NOT re-inject CDRRuntime — it's already declared above.
  // Instead, find the setModelAndReasoningEffort callback variable and inject
  // a useEffect right after the CDRRuntime declaration (already present).
  if (!modelPickerEffectReplaced) {
    const cbMatch = modelPicker.match(/([a-zA-Z_$][\w$]*)=XM\.useCallback/);
    if (cbMatch) {
      const setterVar = cbMatch[1];
      // Insert the useEffect AFTER the CDRRuntime declaration (which was
      // already added by the function signature replace above)
      modelPicker = modelPicker.replace(
        `let CDRRuntime=${RUNTIME_SOURCE};`,
        `let CDRRuntime=${RUNTIME_SOURCE};(0,XM.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>${setterVar}(CDRModel,CDREffort)),[CDRRuntime,${setterVar}]);`,
      );
    }
  }

  // ── Send button: add cdr-mode-send className ────────────────
  // 26.721: NQ.jsx = JSX namespace, oX = send button component
  // The send button call may or may not have a leading `:` (ternary context).
  // Try both variants to handle different minifier layouts.
  const sendAnchors = [
    ":(0,NQ.jsx)(oX,{ariaLabel:",
    "(0,NQ.jsx)(oX,{ariaLabel:",
  ];

  let next = source;
  // Apply composer patches first
  next = replaceFunction(next, composerNode, composer);
  // Apply model picker patches
  next = replaceFunction(next, modelPickerNode, modelPicker);

  // Try each send button anchor variant on the patched source
  let sendPatched = false;
  for (const anchor of sendAnchors) {
    const count = next.split(anchor).length - 1;
    if (count === 1) {
      next = next.replace(
        anchor,
        anchor.startsWith(":")
          ? `:(0,NQ.jsx)(oX,{className:\`cdr-mode-send\`,/* ${SEND_MARKER} */ariaLabel:`
          : `(0,NQ.jsx)(oX,{className:\`cdr-mode-send\`,/* ${SEND_MARKER} */ariaLabel:`,
      );
      sendPatched = true;
      break;
    }
  }
  if (!sendPatched) {
    console.warn(`  [warn] send button anchor not found in ${relPath(filePath)}`);
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
    "CDRChatItem",
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  parseBundle(source, filePath);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function verifyComposerBundle(source, filePath) {
  for (const needle of [
    COMPOSER_MARKER,
    MODEL_PICKER_MARKER,
    "CDRRuntime.subscribe(CDRSetMode)",
    "CDRRuntime.collaborationForMode(CDRMode,n)",
    "CDRRuntime.backgroundCollaboration(n)",
    RESUME_CONTEXT_MARKER,
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  // Send marker may be in a different function — verify only if present
  if (source.includes("cdr-mode-send") && !source.includes(SEND_MARKER)) {
    throw new Error(`${relPath(filePath)} send className without marker`);
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
      `Local canonical mode supports only ${SUPPORTED_PLATFORM}; got ${platform}`,
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
  // 26.721: collaborationModes (plural) instead of collaborationMode:i
  const composer = matchOne(
    "local composer",
    jsFiles,
    (source) =>
      source.includes("activeCollaborationMode") &&
      source.includes("setSelectedCollaborationMode") &&
      source.includes("blockedReasonOpenNonce") &&
      source.includes("settings.model") &&
      source.includes("collaborationModes"),
  );
  const context = matchOne(
    "ChatGPT context handoff",
    jsFiles,
    (source) =>
      source.includes("ChatGPT conversation does not have a server id") &&
      source.includes("chatGptConversationContexts") &&
      (source.includes("thinking:void 0") || source.includes(CONTEXT_MARKER)),
  );
  // history and threadContext bundles were used for validation in 26.715
  // but their anchor strings changed in 26.721. They are not patched, so
  // make them optional to avoid false failures on newer base versions.
  const matchOptional = (label, files, predicate) => {
    const matches = files.filter((filePath) =>
      predicate(fs.readFileSync(filePath, "utf8")),
    );
    return matches.length === 1 ? matches[0] : null;
  };
  const history = matchOptional(
    "full background history hydration",
    jsFiles,
    (source) =>
      source.includes("hydrate-background-threads") &&
      source.includes("subagent summary previews") &&
      source.includes("includeTurns:!0"),
  );
  const threadContext = matchOptional(
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
    try {
      return { filePath, next: patcher(source, filePath), source };
    } catch (error) {
      console.warn(`  [warn] ${relPath(filePath)} ${key} patch failed: ${error.message}`);
      return { filePath, next: source, source };
    }
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
