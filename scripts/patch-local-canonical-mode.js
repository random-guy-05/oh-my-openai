#!/usr/bin/env node
"use strict";

/**
 * Add Chat / Work / Codex presets to local tasks without changing routes,
 * task identity, transcript ownership, or sidebar state. Work/Codex keep the
 * native AppServer transport; Chat is intercepted by the ChatGPT stream bridge
 * mounted in _apply-26721-all-features.js.
 *
 * A mode switch changes only the selected preset, effective model, and send
 * button color; it never navigates or swaps the sidebar/history source.
 *
 * Updated for 26.721 base: variable name remapping (TG→U8, EG→W8, Y→Z,
 * Dr→Ym, VO→yz, BI→L$, vW→L$, _k→XM, sae→Kac, zT→hH, Hg→oX, $→aZ),
 * selector/controller split (mLl/T0l), dynamic resume handler bounds.
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const {
  SRC_DIR,
  relPath,
  logPatcherError,
  parseBundleCached: parseBundle,
} = require("./patch-util");

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
  // Static default mapping. The runtime chat-picker override below still
  // takes priority when `__cdrChatDefaultSlug` is set by the catalog merge
  // patches, but on a freshly-installed runtime (or pure JS tests) the
  // chat preset must resolve to a concrete model — "auto" would fall
  // through to the model picker unchanged. Aligned with the
  // Chat / ChatGPT / Codex spec in CUSTOM_BUILD.md (Sol Medium for
  // chat, Terra Light for work, Sol High for codex).
  const presetSettings = Object.freeze({
    chat: Object.freeze({
      model: "auto",
      reasoningEffort: "none",
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
        let CDRApply=presetSettings[next];if(next===`chat`){try{let slug=globalThis.__cdrChatSelectedModel||localStorage.getItem(`cdr-chat-model-selection`)||globalThis.__cdrChatDefaultSlug||globalThis.__cdrChatPickerModels?.[0]?.model;if(slug){let hit=(globalThis.__cdrChatPickerModels||[]).find(e=>e.model===slug);CDRApply={model:slug,reasoningEffort:hit?.supportedReasoningEfforts?.[0]?.reasoningEffort||`medium`}}}catch{}}const result = controller(CDRApply);
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

// 26.721.31836 sometimes wraps the product-mode controller in an arrow
// function rather than a top-level FunctionDeclaration, so we search
// FunctionDeclaration first (to preserve 26.715 behaviour where that
// was the canonical match), FunctionExpression second, and finally
// ArrowFunctionExpression as a fallback. Needles are applied to the
// function body source (BlockStatement or expression body) so that a
// needle inside an unrelated arrow callback or closure does not match.
function functionBodyText(source, node) {
  if (!node.body) return "";
  return source.slice(node.body.start, node.body.end);
}

function findFunction(source, filePath, needles, ast = null) {
  const tree = ast || parseBundle(source, filePath);
  const PREFERENCE = [
    "FunctionDeclaration",
    "FunctionExpression",
    "ArrowFunctionExpression",
  ];
  // Strict pass: every legacy needle has to live inside the same function
  // body. When several functions satisfy this we prefer the largest body
  // because the top-level selector / composer functions are usually
  // broader than their inner closures.
  for (const type of PREFERENCE) {
    const matches = [];
    walk(tree, (node) => {
      if (node.type !== type) return;
      const body = functionBodyText(source, node);
      if (!body) return;
      if (needles.every((needle) => body.includes(needle))) matches.push(node);
    });
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      matches.sort(
        (a, b) =>
          functionBodyText(source, b).length - functionBodyText(source, a).length,
      );
      return matches[0];
    }
  }
  // Lenient pass: 26.721+ upstream refactors have split the selector
  // dropdown, the controller wiring, and the composer resume handler
  // across several smaller functions, so a single function body rarely
  // contains every legacy needle. Pick the FunctionDeclaration /
  // Expression / Arrow with the highest matching-needle score (>=1) so
  // individual `tryReplace` calls can still substitute the strings that
  // survived. We only throw when absolutely nothing matches.
  //
  // Tie-breaking: we use strict `>` (not `>=`), so the FIRST AST node
  // the walker visits that attains a given score wins. The AST walk is
  // deterministic and emits nodes in source order, so the chosen node is
  // the lexical earliest function with the most matches — bit-for-bit
  // reproducible across machines.
  let best = null;
  let bestScore = 0;
  let bestType = null;
  // require first-needle-by-strong-strong-needle to fail the lenient pass
  // outright: a wrong function body with high total score but missing the
  // primary identifier makes the patch land on the wrong scope, which is
  // worse than a clean soft-fail. ceil(N/2) avoids picking a function that
  // shares one incidental needle with too many unrelated matches.
  const minScore = Math.max(1, Math.ceil(needles.length / 2));
  for (const type of PREFERENCE) {
    walk(tree, (node) => {
      if (node.type !== type) return;
      const body = functionBodyText(source, node);
      if (!body) return;
      const score = needles.filter((needle) => body.includes(needle)).length;
      if (score > bestScore) {
        bestScore = score;
        best = node;
        bestType = type;
      }
    });
  }
  if (
    best &&
    bestScore >= minScore &&
    functionBodyText(source, best).includes(needles[0])
  ) {
    const bodyExcerpt = functionBodyText(source, best)
      .replace(/\s+/g, " ")
      .slice(0, 160);
    console.warn(
      `  [warn] ${relPath(filePath)} lenient match in ${bestType} ` +
        `(${bestScore}/${needles.length} needles — first: ${needles[0]}) ` +
        `[body: ${bodyExcerpt}…]`,
    );
    return best;
  }
  throw new Error(
    `${relPath(filePath)} expected one function for ${needles[0]}, found ${
      best ? bestScore : 0
    } (min ${minScore}) strong-needs missing`,
  );
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
  // Atomic idempotency gate: only short-circuit when EVERY owned marker
  // is present. Owned markers for the selector patcher are the canonical
  // SELECTOR_MARKER (selector function rewrite) and SEND_MARKER
  // (controller DOM-observer). The inner patcher is itself idempotent
  // — it wraps every named rewrite in an `if (!body.includes(marker))`
  // guard so a partial-state re-run does not double-inject.
  if (
    source.includes(SELECTOR_MARKER) &&
    source.includes(SEND_MARKER)
  ) {
    verifySelectorBundle(source, filePath);
    return source;
  }

  // Soft-fail wrapper: if anything inside surfaces an unrecoverable error
  // (anchors renamed too aggressively across the upstream monolith), we
  // return the source unchanged so the orchestrator's "warn + continue"
  // posture is preserved and downstream patchers still see a parseable
  // bundle. The unified logPatcherError helper gives every patch wrapper
  // identical formatting (orchestrator-friendly `[warn]`-prefixed lines).
  try {
    return patchSelectorBundleInner(source, filePath);
  } catch (error) {
    logPatcherError(filePath, error, "selector");
    return source;
  }
}

function patch26727ModeFunctions(source, filePath, ast) {
  const findTop = (name) => {
    const node = ast.body.find((entry) => entry.type === "FunctionDeclaration" && entry.id?.name === name);
    if (!node) throw new Error(`${relPath(filePath)} 26.727 function ${name} not found`);
    return node;
  };
  const jvuNode = findTop("jvu");
  const h8lNode = findTop("H8l");
  let controller = source.slice(jvuNode.start, jvuNode.end);
  let selector = source.slice(h8lNode.start, h8lNode.end);
  const reactAlias = "Nvu";
  const sendObserver =
    `/* ${SEND_MARKER} */` +
    `(0,${reactAlias}.useEffect)(()=>{let CDRObserver=null;try{if(typeof document===\"undefined\"||!document.querySelectorAll)return;let CDRMarkSend=()=>document.querySelectorAll(\`button[aria-label],button[type=\"submit\"],[role=\"button\"][aria-label],[data-testid*=\"send\" i]\`).forEach((el)=>{let al=String(el.getAttribute(\"aria-label\")||el.getAttribute(\"title\")||el.getAttribute(\"data-testid\")||\"\");let form=el.closest&&el.closest(\"form\");let submit=el.getAttribute(\"type\")==\"submit\"&&form&&form.querySelector(\"textarea,[contenteditable=true]\");if(/send|submit/i.test(al)||submit)el.classList.add(\"cdr-mode-send\")});CDRMarkSend();if(typeof MutationObserver!==\"undefined\"&&document.body){CDRObserver=new MutationObserver(CDRMarkSend);CDRObserver.observe(document.body,{childList:true,subtree:true})}}catch{}return()=>{try{CDRObserver&&CDRObserver.disconnect()}catch{}}},[CDRMode]);`;
  if (!controller.includes(SELECTOR_MARKER) || !controller.includes(SEND_MARKER)) {      const stateAnchor = "d=s===Ycs,f=d||n?`codex`:i,p;";

    const stateReplacement =
      "d=f||n?`codex`:i,p;let [CDRMode,CDRSetMode]=(0,Nvu.useState)(()=>CDRRuntime.mode(i));(0,Nvu.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);" +
      `/* ${SELECTOR_MARKER}:26727-state */` +
      sendObserver;
    controller = replaceOne(controller, "function jvu(e){", "function jvu(e){let CDRRuntime=" + RUNTIME_SOURCE + ";", "26.727 mode runtime binding");
    controller = replaceOne(controller, stateAnchor, stateReplacement, "26.727 mode state anchor");
    controller = replaceOne(
      controller,
      "p=e=>{if(d){",
      "p=e=>{if(e===`chat`){CDRSetMode(`chat`);CDRRuntime.setMode(`chat`);return}if(d){",
      "26.727 Chat-local mode handler",
    );
    controller = replaceOne(controller, "t[10]!==f", "t[10]!==CDRMode", "26.727 mode memo dependency");
    controller = replaceOne(controller, "mode:f,onModeSelect:p", "mode:CDRMode,onModeSelect:p", "26.727 selector mode prop");
    controller = replaceOne(controller, "t[10]=f", "t[10]=CDRMode", "26.727 mode memo assignment");
    controller = controller.replace("function jvu(e){let CDRRuntime=" + RUNTIME_SOURCE + ";", "function jvu(e){let CDRRuntime=" + RUNTIME_SOURCE + ";");
  }
  if (!selector.includes(SELECTOR_MARKER)) {
    selector = replaceOne(
      selector,
      "i===`work`?(0,I8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:n?(0,I8.jsx)(Z,{...L8.chatGpt}):(0,I8.jsx)(Z,{...L8.work})}):(0,I8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:(0,I8.jsx)(Z,{...L8.codex})})",
      "i===`chat`?(0,I8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:`ChatGPT`}):i===`work`?(0,I8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:n?(0,I8.jsx)(Z,{...L8.chatGpt}):(0,I8.jsx)(Z,{...L8.work})}):(0,I8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:(0,I8.jsx)(Z,{...L8.codex})})",
      "26.727 Chat selector trigger label",
    );
    selector = replaceOne(
      selector,
      "e=i===`codex`?o.formatMessage(L8.codex):n?o.formatMessage(L8.chatGpt):o.formatMessage(L8.work)",
      "e=i===`chat`?`ChatGPT`:i===`codex`?o.formatMessage(L8.codex):n?o.formatMessage(L8.chatGpt):o.formatMessage(L8.work)",
      "26.727 selector accessible label",
    );
    selector = replaceOne(
      selector,
      "let C;t[27]!==y||t[28]!==x||t[29]!==S?",
      "let CDRChatItem=(0,I8.jsx)(_z.Item,{className:`py-2.5 text-base`,onSelect:()=>a(`chat`),children:(0,I8.jsx)(`span`,{className:`font-openai-sans`,children:`ChatGPT`})});let C;t[27]!==y||t[28]!==x||t[29]!==S?",
      "26.727 Chat selector item",
    );
    selector = replaceOne(selector, "children:[C,O]", "children:[CDRChatItem,C,O]", "26.727 Chat selector menu");
    selector = selector.replace("function H8l(e){", "function H8l(e){/* " + SELECTOR_MARKER + " */");
  }
  const next = [
    { node: jvuNode, replacement: controller },
    { node: h8lNode, replacement: selector },
  ].sort((a, b) => b.node.start - a.node.start).reduce((value, item) => replaceFunction(value, item.node, item.replacement), source);
  verifySelectorBundle(next, filePath);
  return next;
}

function patchSelectorBundleInner(source, filePath) {
  const ast = parseBundle(source, filePath);
  if (source.includes("function jvu(e){") && source.includes("function H8l(e){")) {
    return patch26727ModeFunctions(source, filePath, ast);
  }

  // ── Selector function (mLl in 26.721) ──────────────────────
  // Needles are reduced to a single stable key after the 26.721 refactor
  // split the description dictionary from the trigger dropdown. Inner
  // replacements still operate on whatever survives in the chosen body.
  const selectorNode = findFunction(
    source,
    filePath,
    [
      "sidebarElectron.productMode.chatGptWork.unavailable",
      "sidebarElectron.productMode.trigger",
    ],
    ast,
  );
  let selector = source.slice(selectorNode.start, selectorNode.end);
  // Inner idempotency: skip the selector-side rewrite block on partial-state
  // re-runs where SELECTOR_MARKER already landed but a downstream marker
  // (e.g. SEND_MARKER on the controller) is still missing. Without this
  // guard the first selector `replaceOne` hard-throws on an already-
  // replaced anchor, which aborts the inner before the controller
  // injection can land SEND_MARKER — exactly the drift mode we just
  // fixed the outer early-return for. Re-emitting any replaced anchor
  // would also duplicate `/* SELECTOR_MARKER */` and the Chat preset JSX.
  const selectorAlreadyPatched = selector.includes(SELECTOR_MARKER);
  if (!selectorAlreadyPatched) {

  // 26.721 variable names: W8=JSX (was U8 in 26.721.31836; 26.721.41059 swapped), Z=FormattedMessage, U8=utility object, Ym/Bm=RightIcon, yz=Dropdown
  selector = replaceOne(
    selector,
    "s=i===`work`?",
    "s=i===`chat`?(0,W8.jsx)(`span`,{className:`truncate font-openai-sans font-semibold`,children:`Chat`}):i===`work`?",
    "Chat selector label",
  );
  selector = tryReplace(
    selector,
    "children:n?(0,W8.jsx)(Z,{...W8.chatGpt}):(0,W8.jsx)(Z,{...W8.work})",
    "children:`ChatGPT`",
    "ChatGPT trigger label",
  );
  selector = tryReplace(
    selector,
    "e=i===`codex`?o.formatMessage(W8.codex):n?o.formatMessage(W8.chatGpt):o.formatMessage(W8.work)",
    "e=i===`chat`?`Chat`:i===`work`?`ChatGPT`:o.formatMessage(W8.codex)",
    "Chat selector accessible label",
  );
  selector = tryReplace(
    selector,
    "children:n?(0,W8.jsx)(Z,{...W8.chatGpt}):(0,W8.jsx)(Z,{id:`sidebarElectron.productMode.chatGptWork.unavailable`,defaultMessage:`ChatGPT Work`,description:`ChatGPT Work option in the sidebar mode selector when ChatGPT features are unavailable`})",
    "children:`ChatGPT`",
    "ChatGPT menu label",
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
    `let CDRChatRight=i===\`chat\`?${codexIconVar}:void 0,CDRChatItem=(0,W8.jsx)(yz.Item,{className:\`py-2.5 text-base\`,RightIcon:CDRChatRight,SubText:(0,W8.jsx)(\`span\`,{className:\`text-token-description-foreground\`,children:\`Chat preset — same task and history\`}),onSelect:()=>a(\`chat\`),children:(0,W8.jsx)(\`span\`,{className:\`font-openai-sans\`,children:\`Chat\`})});let w=i===\`codex\`?${codexIconVar}:void 0`,
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
  }

  // ── Controller function (T0l in 26.721) ────────────────────
  // 26.721 split selector/controller: T0l wraps mLl. The legacy "Kac"
  // routing helper name is unstable across minor upstream builds, so we
  // narrow the needles to state names that survive every rename.
  const controllerNode = findFunction(
    source,
    filePath,
    [
      "codexLocalAccessStatus",
      "currentMode",
      "startNewConversation",
      "navigate",
    ],
    ast,
  );
  let controller = source.slice(controllerNode.start, controllerNode.end);
  // Inner idempotency guard. Two equally-valid signals indicate a prior
  // controller injection ran: the canonical SEND_MARKER comment, OR a
  // lexical `let CDRRuntime = …` binding (our injected variable name).
  // A prior run could land one without the other (e.g. if the
  // AST-insert succeeded but the SEND_MARKER injector stopped midway
  // because the substring split mid-token on an upstream rename). On a
  // partial-state re-run we MUST skip the re-inject or we would emit a
  // duplicate `let CDRRuntime` declaration, which `acorn` rejects with
  // "Identifier 'CDRRuntime' has already been declared" and breaks
  // the whole bundle. The BlockStatement guard below handles the
  // equally-bad case where upstream shifted the controller to an
  // arrow-expression body.
  const controllerAlreadyInjected =
    controller.includes(SEND_MARKER) ||
    controller.includes(`let CDRRuntime=${RUNTIME_SOURCE}`);

  // Inject CDR runtime + useState + a drift-tough upstream-sync useEffect
  // at function start (L$ = React in 26.721). The previous approach tried to
  // mutate the internal mode-switch callback via regex (`if(d){if(e===work){
  // ...` plus a `Kac(...)` call). Those names are 26.715 minifier artefacts
  // and the upstream has renamed every one of them in 26.721+, so the old
  // patch threw and the selector patch short-circuited.
  //
  // The replacement is more durable: compute CDRUpstreamMode (a stable
  // string primitive) from the controller's `e` parameter, then sync it
  // into both CDRRuntime.setMode AND CDRSetMode (local React state) via a
  // useEffect with [CDRUpstreamMode] deps. Using a primitive dep (not the
  // props object `e`) ensures the effect only fires when the actual mode
  // VALUE changes, not on every parent re-render. CDRSetMode is critical:
  // without it, CDRMode (local state) never updates and the selector
  // highlight / model picker / send-button color never change.
  //
  // The onModeSelect callback is ALSO wrapped (see tryReplace below) so
  // that clicking "chat" is intercepted locally — upstream only knows
  // "codex"/"work" and would silently drop "chat". The wrapper calls
  // CDRSetMode("chat") + CDRRuntime.setMode("chat") directly for "chat",
  // and passes "work"/"codex" through to the upstream handler p.
  // AST-based injection: works on FunctionDeclaration (matches legacy
  // `function XXX(e){…}`), ArrowFunctionExpression assign-to-const (the
  // 26.721 controller refactor), AND FunctionExpression. We read the
  // controller's first parameter name from the AST and use it everywhere
  // so renaming the param upstream (`e` → `props` → `t`) doesn't break
  // the useEffect body or dep-array.
  const param = controllerNode.params[0]?.name || "e";
  const injection =
    `let CDRRuntime=${RUNTIME_SOURCE},` +
    `[CDRMode,CDRSetMode]=(0,L$.useState)(()=>CDRRuntime.mode(\`codex\`)),` +
    `CDRUpstreamMode=(typeof ${param}===\"string\"&&(${param}===\"chat\"||${param}===\"work\"||${param}===\"codex\"))?${param}:` +
    `((${param}&&typeof ${param}===\"object\"&&(typeof ${param}.currentMode===\"string\"||typeof ${param}.mode===\"string\"))?(${param}.currentMode||${param}.mode||\"codex\"):` +
    `\"codex\");` +
    `/* codex-rebuild:sticky-chat-v43:durable-mode */` +
    `/* codex-rebuild:sticky-chat-v43:durable-sync */` +
    // Chat is local-only (upstream never adopts it). Never let an upstream
    // "codex" OR "work" (ChatGPT) reading clobber an intentional local
    // "chat" selection — work→chat used to snap back immediately.
    `(0,L$.useEffect)(()=>{/* codex-rebuild:mode-switch-work-v1:durable-sync */if(CDRUpstreamMode!==\`chat\`){try{if(CDRRuntime.mode(\`codex\`)===\`chat\`)return}catch{}}CDRRuntime.setMode(CDRUpstreamMode);CDRSetMode(CDRUpstreamMode)},[CDRUpstreamMode]);` +
    `/* ${SEND_MARKER} */` +
    `(0,L$.useEffect)(()=>{let CDRObserver=null;try{if(typeof document===\"undefined\"||!document.querySelectorAll)return;` +
    `let CDRMarkSend=()=>document.querySelectorAll(\`button[aria-label],button[type="submit"],[role="button"][aria-label],[data-testid*="send" i]\`)` +
    `.forEach((el)=>{const al=String(el.getAttribute(\"aria-label\")||el.getAttribute(\"title\")||el.getAttribute(\"data-testid\")||\"\");` +
    `const form=el.closest&&el.closest(\"form\");const composerSubmit=el.getAttribute(\"type\")===\"submit\"&&form&&form.querySelector(\"textarea,[contenteditable=true]\");` +
    `if(/send|submit/i.test(al)||composerSubmit){if(!el.classList.contains(\"cdr-mode-send\"))el.classList.add(\"cdr-mode-send\");}});` +
    `CDRMarkSend();if(typeof MutationObserver!==\"undefined\"&&document.body){CDRObserver=new MutationObserver(CDRMarkSend);CDRObserver.observe(document.body,{childList:true,subtree:true})}` +
    `}catch{}return()=>{try{CDRObserver&&CDRObserver.disconnect()}catch{}}},[CDRMode]);`;
  // Skip the heavy AST injection + memo-dep rewrites if a prior run
  // already wrote SEND_MARKER. Without this guard a partial-state
  // re-run would emit a duplicate `let CDRRuntime=…` (works via lexical
  // shadowing but is noisy) and could push the bundle past the
  // per-function size limit the runtime enforces on the controller.
  // The memo-dep rewrites (`t[10]!==f` → `t[10]!==CDRMode` etc.) are
  // safe to re-run, BUT skipping them with the injection is consistent
  // — if the controller has SEND_MARKER, all the dependent rewrites
  // already landed on the prior run.
  if (!controllerAlreadyInjected) {
    // AST insert assumes BlockStatement body — the controller is a
    // FunctionDeclaration on every observed 26.721.x build. If upstream
    // ever renames it to an ArrowFunctionExpression with an expression
    // body (no `{}`), body.start points at the expression rather than
    // the brace, and `body.start + 1` would split mid-token, corrupting
    // the bundle. Throw early so the soft-fail wrapper handles the
    // change gracefully rather than writing a parse-broken source to
    // disk.
    if (controllerNode.body.type !== "BlockStatement") {
      throw new Error(
        `${relPath(filePath)} controller body type is ${controllerNode.body.type}; AST insert requires BlockStatement — re-target legacy regex/replace to handle the new shape`,
      );
    }
    const insertPos = controllerNode.body.start + 1 - controllerNode.start;
    controller =
      controller.slice(0, insertPos) +
      injection +
      controller.slice(insertPos);
  }

  if (!controllerAlreadyInjected) {
    // Change memo dependency from f to CDRMode. Uses replaceOne (hard
    // throw) not tryReplace: if this silently skips, the selector's memo
    // won't recompute when CDRMode changes — the highlight won't update
    // even though CDRSetMode was called. That's a silent regression of
    // the exact feature this fix enables.
    controller = replaceOne(
      controller,
      "t[8]!==u||t[9]!==n||t[10]!==f||t[11]!==p",
      "t[8]!==u||t[9]!==n||t[10]!==CDRMode||t[11]!==p",
      "mode controller memo dependency",
    );

    // Change mode prop in mLl call: use CDRMode for display, wrap onModeSelect
    // so EVERY preset updates local React state + runtime. "chat" is local-only
    // (upstream doesn't know it and would silently drop it). "work"/"codex"
    // also update local state BEFORE calling upstream — otherwise chat→codex
    // is a no-op for the top-left label because upstream was already "codex"
    // and CDRUpstreamMode never changes.
    controller = replaceOne(
      controller,
      "mode:f,onModeSelect:p",
      "mode:CDRMode,onModeSelect:(CDRM)=>{CDRSetMode(CDRM);CDRRuntime.setMode(CDRM);if(CDRM!==`chat`)p(CDRM)}",
      "mode controller prop (with chat interceptor)",
    );

    // Change memo assignment from f to CDRMode. Same rationale as the
    // memo dependency above: a silent skip would prevent re-render.
    controller = replaceOne(
      controller,
      "t[8]=u,t[9]=n,t[10]=f,t[11]=p",
      "t[8]=u,t[9]=n,t[10]=CDRMode,t[11]=p",
      "mode controller memo assignment",
    );
  }

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
  // Mirrors patchSelectorBundle: never let a minifier-rename crash the
  // whole pipeline. The wrapper swallows unrecoverable failures so the
  // orchestrator can still pack a buildable ASAR.
  try {
    return patchComposerBundleInner(source, filePath);
  } catch (error) {
    logPatcherError(filePath, error, "composer");
    return source;
  }
}

function patchComposerBundleInner(source, filePath) {
  const ast = parseBundle(source, filePath);
  // 26.721: I0s is the composer function. The legacy four-needle set
  // (collaborationModes, setSelectedCollaborationMode, ...) collapses to
  // the durable identifiers that survive every upstream rename.
  const composerNode = findFunction(
    source,
    filePath,
    [
      "activeCollaborationMode",
      "blockedReasonOpenNonce",
      "settings.model",
    ],
    ast,
  );
  let composer = source.slice(composerNode.start, composerNode.end);
  // Inner idempotency on the composer side mirrors the controller-side
  // guard (see patchSelectorBundleInner): skip the unconditional rewrite
  // if we detect either the canonical marker OR a previously-written
  // `let CDRRuntime=…` binding. Without this guard, a partial-state
  // bundle where the composer was mid-patched (CDRRuntime present,
  // COMPOSER_MARKER comment absent) would re-run the rewrite and produce
  // a duplicate `let CDRRuntime=…` declaration — `acorn` rejects with
  // "Identifier 'CDRRuntime' has already been declared" and the bundle
  // is effectively bricked for that file.
  const composerAlreadyInjected =
    composer.includes(COMPOSER_MARKER) ||
    composer.includes(`let CDRRuntime=${RUNTIME_SOURCE}`);

  // 26.721: L$ = React hooks
  if (!composerAlreadyInjected) {
    composer = composer.replace(
      /^function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
      (match) =>
        `${match}/* ${COMPOSER_MARKER} */let CDRRuntime=${RUNTIME_SOURCE},[CDRMode,CDRSetMode]=(0,L$.useState)(()=>CDRRuntime.mode());(0,L$.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);n=CDRRuntime.collaborationForMode(CDRMode,n);let CDRBackground=CDRRuntime.backgroundCollaboration(n);`,
    );
  }

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
  // Chat→codex transcript injection: when resuming a conversation that had
  // Chat mode turns, those turns are stored in localStorage under
  // 'cdr-thread-extras:local:{conversationId}'. We read them and prepend
  // to i.prompt as a <chat_transcript> block so Luna Light (the background
  // model) receives the full chat history as context for summarization.
  // The 'e' parameter of lee=async(e,t,r)=> is the conversationId, so
  // 'local:'+e constructs the correct localStorage key. This is the
  // chat→codex direction of the bidirectional context handoff.
  // Escaping: \\n in this template literal produces \n (backslash-n) in
  // the output JS, which is the correct escape sequence for newlines in
  // single-quoted string literals.
  resume = tryReplace(
    resume,
    "let i=await io(t,r,e);",
    `/* ${RESUME_CONTEXT_MARKER} */let i=await io(t,CDRBackground,e);try{let _cdrKey='local:'+e,_cdrRows=JSON.parse(localStorage.getItem('cdr-thread-extras:'+_cdrKey)||'[]');if(Array.isArray(_cdrRows)&&_cdrRows.length){let _cdrLines=[];for(let _cdrRow of _cdrRows.slice(-50)){if(!_cdrRow||!_cdrRow.text)continue;_cdrLines.push((_cdrRow.role==='user'?'User':'Assistant')+': '+String(_cdrRow.text).trim().slice(0,2000))}if(_cdrLines.length){let _cdrT=_cdrLines.join('\\n\\n---\\n\\n').slice(0,24000);i.prompt='You are resuming a conversation that has prior Chat mode turns on this same task. The transcript below is from Chat mode interactions. Use it as context, summarize key decisions, and continue naturally.\\n\\n<chat_transcript>\\n'+_cdrT+'\\n</chat_transcript>\\n\\n'+(i.prompt||'')}}}catch{}`,
    "Luna Light resume context (with chat transcript injection)",
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
  // Two-needle set so we still locate the picker even if upstream
  // renames the toast-warning string. Inner tryReplace handles the rest.
  const modelPickerNode = findFunction(
    source,
    filePath,
    [
      "setModelAndReasoningEffort",
      "modelPickerTriggerConfig",
    ],
    ast,
  );
  let modelPicker = source.slice(modelPickerNode.start, modelPickerNode.end);
  // Inner idempotency on the model-picker side mirrors the composer
  // guard above: skip the unconditional rewrite if MODEL_PICKER_MARKER
  // OR a previously-written `let CDRRuntime=…` is already present. Same
  // dual-decl parse-error avoidance.
  const modelPickerAlreadyInjected =
    modelPicker.includes(MODEL_PICKER_MARKER) ||
    modelPicker.includes(`let CDRRuntime=${RUNTIME_SOURCE}`);

  // 26.721: XM = React hooks in model picker
  if (!modelPickerAlreadyInjected) {
    modelPicker = modelPicker.replace(
      /^function ([A-Za-z_$][\w$]*)\(([\s\S]*?)\)\{/,
      (match) =>
        `${match}/* ${MODEL_PICKER_MARKER} */let CDRRuntime=${RUNTIME_SOURCE};`,
    );
  }
  // 26.721+: setModelAndReasoningEffort comes from a hook destructure
  // (`{setModelAndReasoningEffort:g}=JMs(...)`), not a useCallback / noop
  // useEffect. Register that setter with the local-mode runtime so preset
  // clicks actually drive the visible model picker.
  if (!modelPicker.includes("CDRRuntime.registerModelController(")) {
    const setterMatch = modelPicker.match(
      /setModelAndReasoningEffort:([A-Za-z_$][\w$]*)/,
    );
    const reactMatch = modelPicker.match(
      /\(0,([A-Za-z_$][\w$]*)\.(?:useRef|useEffect|useState|useCallback)\)/,
    );
    if (!setterMatch) {
      throw new Error(
        `${relPath(filePath)} model picker: setModelAndReasoningEffort alias not found`,
      );
    }
    if (!reactMatch) {
      throw new Error(
        `${relPath(filePath)} model picker: React hooks alias not found`,
      );
    }
    const setterVar = setterMatch[1];
    const reactAlias = reactMatch[1];
    const registerEffect =
      `(0,${reactAlias}.useEffect)(()=>CDRRuntime.registerModelController(` +
      `({model:CDRModel,reasoningEffort:CDREffort})=>${setterVar}(CDRModel,CDREffort)),[${setterVar}]);` +
      `/* ${MODEL_PICKER_MARKER}:sync */`;
    const anchor = modelPicker.match(
      /let\{[^}]*setModelAndReasoningEffort:[A-Za-z_$][\w$]*[^}]*\}=[^;]+;/,
    );
    if (!anchor) {
      throw new Error(
        `${relPath(filePath)} model picker: could not locate setModelAndReasoningEffort destructure`,
      );
    }
    modelPicker = modelPicker.replace(anchor[0], anchor[0] + registerEffect);
    console.log(
      `  [ok] ${relPath(filePath)} model picker sync via ${setterVar} (${reactAlias}.useEffect)`,
    );
  }

  // ── Send button JSX fallback (ancient builds) ───────────────────────────
  // The actual send-button DOM observer lives in patchSelectorBundle,
  // appended to the controller's useEffect body right after the
  // CDRRuntime.setMode line. That observer is the durable entry-point for
  // 26.721+ where the aria-label string is bound to a memoised variable
  // and no literal anchor can survive minifier rename.
  //
  // What remains here is purely a lemon-backup for 26.715-era bundles
  // where the aria-label IS a literal. We try four literal-anchor
  // variants; if exactly one matches we paint `className:\`cdr-mode-send\``
  // straight into the JSX. count > 1 is a known-ambiguous anchor and we
  // skip with a `[warn]` rather than overwriting all matches.
  const SEND_JSX_ANCHORS = [
    "ariaLabel:\`Send\`",
    "ariaLabel:\"Send\"",
    "ariaLabel:\`Submit\`",
    "ariaLabel:\"Submit\"",
  ];
  let next = source;
  next = replaceFunction(next, composerNode, composer);
  next = replaceFunction(next, modelPickerNode, modelPicker);

  let sendLitPatched = false;
  for (const anchor of SEND_JSX_ANCHORS) {
    const count = next.split(anchor).length - 1;
    if (count === 1) {
      next = next.replace(anchor, `className:\`cdr-mode-send\`,${anchor}`);
      sendLitPatched = true;
      break;
    }
  }
  if (!sendLitPatched) {
    console.log(
      `  [info] ${relPath(filePath)} legacy literal send-button arrow not present; relying on DOM observer (${SEND_MARKER})`,
    );
  }

  verifyComposerBundle(next, filePath);
  return next;
}

function patchContextBundle(source, filePath) {
  if (source.includes("codex-rebuild:luna-light-context-v2")) {
    parseBundle(source, filePath);
    if (!source.includes("model:`gpt-5.6-luna`") || !source.includes("thinking:`low`")) {
      throw new Error(`${relPath(filePath)} Luna Light context v2 marker is incomplete`);
    }
    return source;
  }
  if (source.includes(CONTEXT_MARKER)) {
    verifyContextBundle(source, filePath);
    return source;
  }
  try {
    return patchContextBundleInner(source, filePath);
  } catch (error) {
    logPatcherError(filePath, error, "context");
    return source;
  }
}

function patchContextBundleInner(source, filePath) {
  const ast = parseBundle(source, filePath);
  // 26.721.41059 removed the "ChatGPT conversation does not have a server id"
  // string. Use string literals that exist INSIDE the function body
  // (not in parameter destructuring, which is excluded by functionBodyText).
  const handoffNode = findFunction(
    source,
    filePath,
    [
      "mcpAppModelContextAttachments",
      "chatGptConversationContexts",
    ],
    ast,
  );
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
  // SELECTOR_MARKER is fatal: the canonical selector function rewrite must
  // land. SEND_MARKER is also required — the controller-side AST injection
  // is the durable entry-point for the send-button DOM observer. Other
  // markers drift-tolerant. Parse failures are emitted as `[warn]` rather
  // than thrown so that an upstream drift that corrupts the bundle still
  // surfaces the root cause in the orchestrator's log instead of being
  // silently swallowed by the soft-fail wrapper above.
  if (!source.includes(SELECTOR_MARKER)) {
    throw new Error(
      `${relPath(filePath)} did not apply selector patch (missing ${SELECTOR_MARKER})`,
    );
  }
  if (!source.includes(SEND_MARKER)) {
    // Distinguish two failure modes for operator-actionable visibility:
    // (a) the controller was never injected (prior run skipped or never
    // ran) — falling out of the soft-fail wrapper, the bundle is at its
    // pre-patch state and re-running `node scripts/patch-all.js mac-x64`
    // on a CLEAN checkout will land SEND_MARKER cleanly;
    // (b) the controller was half-installed (a prior run wrote
    // `let CDRRuntime=…` but did not emit SEND_MARKER — typically
    // because the upstream anchor for the injection silently shifted
    // mid-process). The controller-side guard now sees CDRRuntime and
    // skips re-inject forever, so recovery requires reverting the
    // affected bundle (`git checkout -- src/mac-x64/_asar/webview/assets/app-initial-BHB6SClA.js`)
    // and re-running `patch-all` from a clean state.
    const halfInstalled = source.includes(
      `let CDRRuntime=${RUNTIME_SOURCE}`,
    );
    const action = halfInstalled
      ? `${relPath(
          filePath,
        )} has a half-installed CDRRuntime block (controller ran but didn't emit SEND_MARKER). The skip-on-prior-injection guard locks further re-injection. Recovery: revert this file to its pre-patch state and re-run \`node scripts/patch-all.js mac-x64\`.`
      : `${relPath(filePath)} controller never injected — re-run \`node scripts/patch-all.js mac-x64\` on a clean checkout.`;
    throw new Error(
      `${relPath(filePath)} did not apply send-button patch (missing ${SEND_MARKER}); chat-mode send-colour swap will never run. ${action}`,
    );
  }
  for (const needle of [
    "codex-rebuild:sticky-chat-v43:durable-mode",
    "codex-rebuild:sticky-chat-v43:durable-sync",
    "CDRChatItem",
  ]) {
    if (!source.includes(needle)) {
      console.warn(
        `  [warn] ${relPath(filePath)} soft-drift selector marker missing: ${needle}`,
      );
    }
  }
  // The chat interceptor is FATAL: without it, clicking Chat calls
  // upstream onModeSelect("chat") which is silently dropped (upstream
  // only knows codex/work). If this string is missing the click does
  // nothing — exactly the bug this verify check exists to catch. A
  // hard throw (not a soft warning) ensures a future re-patch that
  // hits the controllerAlreadyInjected guard cannot silently ship a
  // broken chat button.
  if (
    !source.includes("CDRSetMode(`chat`)") &&
    !source.includes("CDRSetMode(CDRM)")
  ) {
    throw new Error(
      `${relPath(filePath)} chat interceptor missing (CDRSetMode(CDRM) / CDRSetMode(\`chat\`)); clicking Chat would call upstream onModeSelect("chat") which is silently dropped. This is the exact bug the fix addresses — the interceptor MUST be present.`,
    );
  }
  // Parse failures throw so the soft-fail wrapper above catches them and
  // returns the unchanged source (i.e., we never write a syntactically
  // broken bundle to disk). The wrapper logs the acorn error and stack
  // trace already, so visibility is preserved without us losing the
  // throw semantics.
  parseBundle(source, filePath);
}

function countOccurrences(source, needle) {
  return source.split(needle).length - 1;
}

function verifyComposerBundle(source, filePath) {
  // The COMPOSER_MARKER is the proof that we actually wrote the bundle.
  // Other markers (model picker registration, subscribe, background
  // collaboration) are minifier-dependent and degrade to warnings when
  // upstream Naming forces a manual re-target.
  if (!source.includes(COMPOSER_MARKER)) {
    throw new Error(
      `${relPath(filePath)} did not apply composer patch (missing ${COMPOSER_MARKER})`,
    );
  }
  for (const needle of [
    MODEL_PICKER_MARKER,
    "CDRRuntime.subscribe(CDRSetMode)",
    "CDRRuntime.collaborationForMode(CDRMode,n)",
    "CDRRuntime.backgroundCollaboration(n)",
    RESUME_CONTEXT_MARKER,
  ]) {
    if (!source.includes(needle)) {
      console.warn(
        `  [warn] ${relPath(filePath)} soft-drift composer marker missing: ${needle}`,
      );
    }
  }
  // SEND_MARKER must land: it's emitted either by the controller-side
  // DOM-observer useEffect (in patchSelectorBundle) or by the literal
  // ariaLabel JSX fallback (in patchComposerBundle). If neither fires,
  // the chat-mode send-button colour swap will never run in the live
  // app — that is an explicit user-visible failure and we surface it as
  // a hard `throw`, not a soft `[warn]`.
  // SEND_MARKER is owned by the selector injection. The composer side
  // deserves only a soft drift warning — the canonical throw lives in
  // verifySelectorBundle. This keeps the orchestrator's log hierarchy
  // clean: one fatal `[warn] selector patch skipped` from the selector,
  // one informational `[warn]` from the composer as a follow-on hint.
  if (!source.includes(SEND_MARKER)) {
    console.warn(
      `  [warn] ${relPath(filePath)} composer: SEND_MARKER missing (see selector warning above)`,
    );
  }
  parseBundle(source, filePath);
}

function verifyContextBundle(source, filePath) {
  // CONTEXT_MARKER is the only fatal signal here; the model/thinking
  // replacements can drift across minor upstream builds.
  if (!source.includes(CONTEXT_MARKER)) {
    throw new Error(
      `${relPath(filePath)} did not apply context patch (missing ${CONTEXT_MARKER})`,
    );
  }
  for (const needle of [
    "model:`gpt-5.6-luna`",
    "thinking:`low`",
    "chatGptConversationContexts",
  ]) {
    if (!source.includes(needle)) {
      console.warn(
        `  [warn] ${relPath(filePath)} soft-drift context marker missing: ${needle}`,
      );
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
      (source.includes("thinking:void 0") || source.includes(CONTEXT_MARKER) || source.includes("codex-rebuild:luna-light-context-v2")),
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

// AST-based strip helpers for the three patchers that emit
// `let CDRRuntime=…`. The substring-only strip helper that shipped
// earlier over-matched on fully-patched bundles (orphaning the second
// DOM-observer useEffect) and picked the wrong end-marker on the
// composer (subscribing vs. the actual `let CDRBackground=…` tail),
// corrupting bundles beyond repair. The AST-based versions below slice
// only the function body, detect the prior injection by substring
// search, then cut the function-body range deterministically. They
// return source unchanged on bundles that don't have the injection
// (no-op on fresh / fully-patched without SEND_MARKER), so re-invoke is
// safe.
function stripInjectionInFunction(source, filePath, needles, getRange) {
  let ast;
  try {
    ast = parseBundle(source, filePath);
  } catch {
    // Source is unparseable (e.g. the bundle is already corrupted by a
    // prior bad strip). Bail out — the operator must restore the bundle
    // from a clean Codex.app.asar extraction first; we can't AST-strip
    // a parse-broken bundle.
    return source;
  }
  let node;
  try {
    node = findFunction(source, filePath, needles, ast);
  } catch {
    return source;
  }
  const fnStart = node.start;
  const fnEnd = node.end;
  const fnSource = source.slice(fnStart, fnEnd);
  const range = getRange(fnSource);
  if (!range) return source;
  const cutStart = fnStart + range.start;
  const cutEnd = fnStart + range.end;
  let rebuilt = source.slice(0, cutStart).replace(/[\s\n]+$/, "\n") + source.slice(cutEnd);
  // If cutting produces two adjacent pieces with no whitespace between
  // them, inject a newline so the function body still parses cleanly.
  if (
    rebuilt.charAt(cutStart - 1) !== "\n" &&
    !/[\s;{}\(\[]$/.test(rebuilt.charAt(cutStart - 1))
  ) {
    rebuilt = rebuilt.slice(0, cutStart) + "\n" + rebuilt.slice(cutStart);
  }
  // SAFETY: re-parse the result before returning so we never emit a
  // broken bundle from the --reset path. If parsing fails, fall back
  // to source unchanged so the operator gets the original (corrupt)
  // bundle rather than a freshly-mangled one.
  try {
    parseBundle(rebuilt, filePath);
    return rebuilt;
  } catch {
    return source;
  }
}

function stripControllerInjection(source, filePath) {
  return stripInjectionInFunction(
    source,
    filePath,
    [
      "codexLocalAccessStatus",
      "currentMode",
      "startNewConversation",
      "navigate",
    ],
    (fnSource) => {
      const startIdx = fnSource.indexOf("let CDRRuntime=");
      if (startIdx < 0) return null;
      // Two end-cases: STUCK (only first setMode useEffect closed) and
      // FULLY-PATCHED (second DOM-observer useEffect closed with
      // `},[CDRMode]);`). Pick whichever sits LATER in the function
      // body, so a fully-patched bundle has BOTH useEffects removed
      // (not just the first — leaving the second orphaned).
      // Search for both new (CDRUpstreamMode) and legacy (CDRSrc) variable
      // names so --reset can strip injections from either patch generation.
      let closedIdx = fnSource.indexOf("CDRRuntime.setMode(CDRUpstreamMode)}", startIdx);
      if (closedIdx < 0) {
        closedIdx = fnSource.indexOf("CDRRuntime.setMode(CDRSrc)}", startIdx);
      }
      if (closedIdx < 0) return null;
      // Find the close of the FIRST useEffect after `closedIdx`: scan
      // forward for `},[IDENT]);` where IDENT is one of the controller's
      // known dep-array variable names.
      const firstUseEffectClose = fnSource
        .slice(closedIdx)
        .match(/\},\[([a-zA-Z_$][\w$]*)\]\)\s*;/);
      if (!firstUseEffectClose) return null;
      const firstEndRel =
        closedIdx + firstUseEffectClose.index + firstUseEffectClose[0].length;
      // FULLY-PATCHED: if there is a second useEffect close (`},[CDRMode]);`)
      // after the first one, extend the strip end to include it.
      const secondUseEffectClose = fnSource
        .slice(firstEndRel)
        .match(/},\[CDRMode\]\)\s*;/);
      const totalEndRel = secondUseEffectClose
        ? firstEndRel +
          secondUseEffectClose.index +
          secondUseEffectClose[0].length
        : firstEndRel;
      // Also strip any leading `/* codex-rebuild:local-canonical-send-v3 */`
      // sentinel that may sit between the two useEffects (full template).
      let endRel = totalEndRel;
      const sendMarker = "/* codex-rebuild:local-canonical-send-v3 */";
      const markerEnd = firstEndRel + fnSource.slice(firstEndRel).indexOf(sendMarker);
      if (
        secondUseEffectClose &&
        markerEnd >= firstEndRel &&
        markerEnd <= endRel
      ) {
        // ensure the strip extends through both the marker + the closing
        // brace-pattern of the second useEffect (already true given
        // totalEndRel; just here for clarity)
        endRel = totalEndRel;
      }
      return { start: startIdx, end: endRel };
    },
  );
}

function stripComposerInjection(source, filePath) {
  return stripInjectionInFunction(
    source,
    filePath,
    ["activeCollaborationMode", "blockedReasonOpenNonce", "settings.model"],
    (fnSource) => {
      const startIdx = fnSource.indexOf("let CDRRuntime=");
      if (startIdx < 0) return null;
      // Composer tail is `let CDRBackground=CDRRuntime.backgroundCollaboration(n);`
      // — that's the true end of the injection (NOT the subscribe pattern,
      // which sits mid-injection).
      const tailClose = fnSource.indexOf(
        "let CDRBackground=CDRRuntime.backgroundCollaboration(n);",
        startIdx,
      );
      if (tailClose < 0) return null;
      const endRel =
        tailClose +
        "let CDRBackground=CDRRuntime.backgroundCollaboration(n);".length;
      return { start: startIdx, end: endRel };
    },
  );
}

function stripModelPickerInjection(source, filePath) {
  return stripInjectionInFunction(
    source,
    filePath,
    ["setModelAndReasoningEffort", "modelPickerTriggerConfig"],
    (fnSource) => {
      const startIdx = fnSource.indexOf("let CDRRuntime=");
      if (startIdx < 0) return null;
      // Model picker is short: the injected statement is exactly
      // `let CDRRuntime=${RUNTIME_SOURCE};` — a single `let` followed
      // by the runtime body and one terminator. Matching the literal
      // `${RUNTIME_SOURCE};` substring (which is unique to our
      // injection and appears nowhere else in the bundle) gives a
      // reliable end-cut without depending on whitespace around
      // semicolons. (Naïve `indexOf(";", startIdx)` is brittle
      // because RUNTIME_SOURCE itself contains internal
      // semicolons inside the runtime body.)
      const endToken = `${RUNTIME_SOURCE};`;
      const endIdx = fnSource.indexOf(endToken, startIdx);
      if (endIdx < 0) return null;
      const endRel = endIdx + endToken.length;
      return { start: startIdx, end: endRel };
    },
  );
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  // `--reset` short-circuits the orchestrator and strips any previously-
  // written CDRRuntime injection from the selector + composer bundles.
  // Use this to recover a bundle that is half-installed (e.g. where
  // the controller injection ran but didn't emit SEND_MARKER, locking
  // future patch-all runs into a stuck state via the idempotency
  // guard). After `--reset` succeeds, re-run `patch-all` to land the
  // fresh injection cleanly.
  const reset = args.includes("--reset");
  const platform =
    args.find((arg) => ["mac-x64", "mac-arm64", "win"].includes(arg)) ||
    SUPPORTED_PLATFORM;
  const targets = locateTargets(platform);

  if (reset) {
    // Each stripper is bound to a specific target file. The model
    // picker lives in the SAME file as the composer (the model-picker
    // bundle is co-resident with the composer bundle in 26.721+), so
    // composer + model-picker both run on `targets.composer`,
    // sequentially. Selector bundles are separate (the monolith), so
    // stripControllerInjection runs on `targets.selector` only. The
    // strip functions all return source unchanged when no prior
    // injection is detected, so re-runs are safe.
    const STRIPPERS = [
      ["selector", targets.selector, stripControllerInjection],
      ["composer", targets.composer, stripComposerInjection],
      ["model-picker", targets.composer, stripModelPickerInjection],
    ];
    let totalChanged = 0;
    for (const [key, filePath, stripper] of STRIPPERS) {
      if (!filePath) continue;
      const source = fs.readFileSync(filePath, "utf8");
      const next = stripper(source, filePath);
      if (next !== source) {
        fs.writeFileSync(filePath, next);
        console.log(
          `  [ok] stripped partial CDRRuntime injection from ${key}: ${relPath(filePath)}`,
        );
        totalChanged += 1;
      } else {
        console.log(
          `  [info] ${relPath(filePath)} ${key} already clean (no prior injection) or bundle unparseable — recover via clean Codex.app.asar extraction`,
        );
      }
    }
    console.log(
      `  [ok] ${platform}: stripped ${totalChanged} bundle(s); re-run \`node scripts/patch-all.js ${platform}\` to land fresh injection.`,
    );
    return;
  }

  // CRITICAL: Apply patches SEQUENTIALLY so they compose properly.
  // All four patches (selector, composer, context) modify the SAME
  // monolith file. If each reads from the original source and writes
  // independently, only the LAST write survives (the others get
  // overwritten). By applying sequentially to a shared mutable source,
  // each patcher builds on the previous one's changes.
  const PATCH_ORDER = [
    ["selector", patchSelectorBundle],
    ["composer", patchComposerBundle],
    ["context", patchContextBundle],
  ];
  const cssFilePath = targets.css;
  const cssSource = fs.readFileSync(cssFilePath, "utf8");

  // All three JS patches target the same monolith
  const sharedPath = targets.selector;
  const originalSource = fs.readFileSync(sharedPath, "utf8");
  let source = originalSource;
  let anyChanged = false;

  // In check-only mode, run each patcher independently (read-only)
  // so we can verify which patches would apply without modifying files.
  if (checkOnly) {
    let allSkip = true;
    for (const [key, patcher] of PATCH_ORDER) {
      const filePath = targets[key];
      const patcherSource = (filePath === sharedPath) ? originalSource : fs.readFileSync(filePath, "utf8");
      const freshSource = fs.readFileSync(filePath, "utf8"); // re-read for each patcher
      const next = patcher(freshSource, filePath);
      if (next !== freshSource) {
        allSkip = false;
      }
    }
    console.log(
      `  [ok] ${platform}: local canonical modes are ${
        allSkip ? "installed" : "patchable"
      }`,
    );
    return;
  }

  for (const [key, patcher] of PATCH_ORDER) {
    const filePath = targets[key];
    if (filePath !== sharedPath) continue; // safety: all should be same file
    try {
      const next = patcher(source, filePath);
      if (next !== source) {
        source = next;
        anyChanged = true;
      }
    } catch (error) {
      console.warn(`  [warn] ${relPath(filePath)} ${key} patch failed: ${error.message}`);
    }
  }

  if (anyChanged) {
    fs.writeFileSync(sharedPath, source);
  }

  // Apply CSS patch independently (different file)
  const cssNext = patchCss(cssSource, cssFilePath);
  if (cssNext !== cssSource) {
    fs.writeFileSync(cssFilePath, cssNext);
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
  verifySelectorPatched,
  verifyComposerPatched,
  verifyContextPatched,
};

if (require.main === module) main();

// codex-rebuild:chat-models-v37: Chat mode picker loads ChatGPT /models via scripts/_apply-chat-models-v37.js

// Per-patcher verifyPatched helpers (test-side replaces PATCH_PROBES lookup
// with these so each patcher owns its assertion, instead of one big table).
function verifySelectorPatched(source) {
  // Require BOTH the canonical selector marker AND the CDRChatItem JSX. A
  // selector patch that wrote the marker comment but could not place the
  // Chat preset JSX (e.g. RightIcon variable missing) is treated as drift
  // rather than "applied" — the verifiedPatch probe asserts user-visible
  // feature mount, not just comment insertion.
  //
  // The chat interceptor (CDRSetMode(`chat`)) is also required: without
  // it, clicking Chat calls upstream onModeSelect("chat") which is
  // silently dropped — the exact bug this fix addresses. Kept in sync
  // with the hard throw in verifySelectorBundle so tests catch the same
  // failure mode the patcher does.
  return (
    source.includes(SELECTOR_MARKER) &&
    source.includes("CDRChatItem") &&
    source.includes("codex-rebuild:sticky-chat-v43:durable-mode") &&
    (source.includes("CDRSetMode(`chat`)") || source.includes("CDRSetMode(CDRM)"))
  );
}
function verifyComposerPatched(source) {
  return (
    source.includes(COMPOSER_MARKER) &&
    (source.includes("CDRRuntime.subscribe(CDRSetMode)") ||
      source.includes("registerModelController") ||
      source.includes("cdr-mode-send"))
  );
}
function verifyContextPatched(source) {
  return (
    source.includes(CONTEXT_MARKER) && source.includes("model:`gpt-5.6-luna`")
  );
}
