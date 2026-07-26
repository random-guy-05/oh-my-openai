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
  // Chat / ChatGPT Work / Codex spec in CUSTOM_BUILD.md (Sol Medium for
  // chat, Terra Light for work, Sol High for codex).
  const presetSettings = Object.freeze({
    chat: Object.freeze({
      model: "gpt-5.6-sol",
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

function patchSelectorBundleInner(source, filePath) {
  const ast = parseBundle(source, filePath);

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
    "children:n?(0,W8.jsx)(Z,{...W8.chatGpt}):(0,W8.jsx)(Z,{id:`sidebarElectron.productMode.chatGptWork.unavailable`,defaultMessage:`ChatGPT Work`,description:`ChatGPT Work option in the sidebar mode selector when ChatGPT features are unavailable`})",
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
  // The replacement is more durable: subscribe to the controller's `e`
  // parameter (the upstream currentMode prop) as the single source of truth,
  // and route it into CDRRuntime.setMode whenever it changes. The upstream
  // will pass through whatever currentMode the controller's parent already
  // selected; CDRRuntime stores it as `cdr-product-mode`. The downstream
  // composer + model-picker patches already read from CDRRuntime, so this
  // single subscription wires the whole feature set.
  // AST-based injection: works on FunctionDeclaration (matches legacy
  // `function XXX(e){…}`), ArrowFunctionExpression assign-to-const (the
  // 26.721 controller refactor), AND FunctionExpression. We read the
  // controller's first parameter name from the AST and use it everywhere
  // so renaming the param upstream (`e` → `props` → `t`) doesn't break
  // the useEffect body or dep-array.
  const param = controllerNode.params[0]?.name || "e";
  const injection =
    `let CDRRuntime=${RUNTIME_SOURCE},` +
    `[CDRMode,CDRSetMode]=(0,L$.useState)(()=>CDRRuntime.mode(\`codex\`));` +
    `/* codex-rebuild:sticky-chat-v43:durable-mode */` +
    `/* codex-rebuild:sticky-chat-v43:durable-sync */` +
    `(0,L$.useEffect)(()=>{const CDRSrc=(typeof ${param}===\"string\"&&(${param}===\"chat\"||${param}===\"work\"||${param}===\"codex\"))?${param}:` +
    `((${param}&&typeof ${param}===\"object\"&&(typeof ${param}.currentMode===\"string\"||typeof ${param}.mode===\"string\"))?(${param}.currentMode||${param}.mode||\"codex\"):` +
    `\"codex\");CDRRuntime.setMode(CDRSrc)},[${param}]);` +
    `/* ${SEND_MARKER} */` +
    `(0,L$.useEffect)(()=>{try{if(typeof document===\"undefined\"||!document.querySelectorAll)return;` +
    `document.querySelectorAll(\`button[aria-label],[role="button"][aria-label]\`)` +
    `.forEach((el)=>{const al=String(el.getAttribute(\"aria-label\")||\"\");` +
    `if(al===\"Send\"||al===\"Submit\"){if(!el.classList.contains(\"cdr-mode-send\"))el.classList.add(\"cdr-mode-send\");}});` +
    `}catch{}},[CDRMode]);`;
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
      const closedIdx = fnSource.indexOf("CDRRuntime.setMode(CDRSrc)}", startIdx);
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
  return (
    source.includes(SELECTOR_MARKER) &&
    source.includes("CDRChatItem") &&
    source.includes("codex-rebuild:sticky-chat-v43:durable-mode")
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
