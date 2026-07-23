#!/usr/bin/env node
/**
 * Unlock ChatGPT model catalog + Sites access for the native Chat experience.
 *
 * - Force Sites availability (bypass Statsig/appgen access gate)
 * - Request internal model slugs and enable the internal-models query
 * - Prefer iim=true on the public /models catalog used by Chat mode
 * - Force the Chat model picker to expose Sol high/medium, 5.5 Instant, 5.4, o3
 *
 * Codex/Work AppServer models remain controlled by patch-latest-models.js
 * (Sol / Terra / Luna with reasoning efforts including high + medium).
 */
const fs = require("fs");
const path = require("path");
const { relPath, SRC_DIR } = require("./patch-util");

const MARKER = "codex-rebuild:chat-catalog-v2";
const MARKER_V1 = "codex-rebuild:chat-catalog-v1";
const SUPPORTED_PLATFORM = "mac-x64";

const SITES_ATOM_FROM =
  "Vv=Ka(U,({get:e})=>{if(!e(Qa,`637432221`))return`unavailable`;let{data:t,isError:n}=e(Bv);return n||t?.enabled===!1?`unavailable`:t?.enabled===!0?`available`:`loading`})";
const SITES_ATOM_V1 =
  "Vv=Ka(U,({get:e})=>(/* codex-rebuild:chat-catalog-v1:sites */`available`))";
const SITES_ATOM_TO =
  `Vv=Ka(U,({get:e})=>(/* ${MARKER}:sites */\`available\`))`;

const INTERNAL_MODELS_FROM =
  "_K=ze(U,({scope:e})=>({enabled:!1,queryFn:()=>e.get(aB).internalModels(),queryKey:[`chatgpt-models`,`internal`],staleTime:l.FIVE_MINUTES}))";
const INTERNAL_MODELS_V1 =
  "_K=ze(U,({scope:e})=>({enabled:!0,queryFn:()=>e.get(aB).internalModels(),queryKey:[`chatgpt-models`,`internal`],staleTime:l.FIVE_MINUTES}))/* codex-rebuild:chat-catalog-v1:internal */";
const INTERNAL_MODELS_TO =
  `_K=ze(U,({scope:e})=>({enabled:!0,queryFn:()=>e.get(aB).internalModels(),queryKey:[\`chatgpt-models\`,\`internal\`],staleTime:l.FIVE_MINUTES}))/* ${MARKER}:internal */`;

const MODELS_IIM_FROM =
  "this.safeGet(`/models`,{parameters:{query:{iim:!1,include_icons:!1}}})";
const MODELS_IIM_V1 =
  "this.safeGet(`/models`,{parameters:{query:{iim:!0,include_icons:!1}}})/* codex-rebuild:chat-catalog-v1:iim */";
const MODELS_IIM_TO =
  `this.safeGet(\`/models\`,{parameters:{query:{iim:!0,include_icons:!1}}})/* ${MARKER}:iim */`;

const MODELS_FN_FROM = "async models(){return IL(await this.request.getModelsResponse())}";

// Must be an expression inside models() — a `function` declaration is a SyntaxError
// in the surrounding class body (that previously left the app on startup-loader forever).
const MERGE_IIFE =
  "(e=>{const t=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5.4`,slug:`gpt-5.4`,title:`5.4`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}];const n=new Set;const r=[];for(const o of[...t,...e?.options??[]]){const k=`${o.slug}:${o.thinkingEffort??``}:${o.lane??``}`;n.has(k)||(n.add(k),r.push(o))}return{...e,defaultModelSlug:`gpt-5.6-sol`,options:r}})";

const MODELS_FN_TO =
  "async models(){return" +
  MERGE_IIFE +
  "(IL(await this.request.getModelsResponse()))}/* " +
  MARKER +
  ":merge */";

const BROKEN_CLASS_HELPER = "}function CDRMergeChatModels(";
const BROKEN_MODELS_CALL =
  "async models(){return CDRMergeChatModels(IL(await this.request.getModelsResponse()))}";

const PLACEHOLDER_FROM =
  "QL=`auto`,$L=[{description:null,lane:`instant`,selectedLabel:`GPT-5 Instant`,slug:QL,title:`Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5 Thinking`,slug:`gpt-5-thinking`,title:`Thinking`}],eR={defaultModelSlug:QL,options:$L,versionOptions:[{defaultModelSlug:QL,id:`gpt-5`,label:`GPT-5`,modelSlugByLane:{auto:QL,thinking:`gpt-5-thinking`},options:$L,slugs:[QL,`gpt-5-thinking`]}]}";
const PLACEHOLDER_TO =
  "QL=`gpt-5.6-sol`,$L=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5.4`,slug:`gpt-5.4`,title:`5.4`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}],eR={defaultModelSlug:QL,options:$L}/* " +
  MARKER +
  ":placeholder */";

function replaceExactly(source, needle, replacement, label) {
  const count = source.split(needle).length - 1;
  if (count !== 1) {
    throw new Error(`${label}: expected 1 anchor, found ${count}`);
  }
  return source.split(needle).join(replacement);
}

function replaceOneOf(source, needles, replacement, label) {
  for (const needle of needles) {
    if (source.includes(needle)) {
      return replaceExactly(source, needle, replacement, label);
    }
  }
  throw new Error(`${label}: none of the anchors were found`);
}

function findCatalogBundle(platform) {
  const assets = path.join(SRC_DIR, platform, "_asar", "webview", "assets");
  if (!fs.existsSync(assets)) {
    throw new Error(`${platform}: extracted webview assets are missing`);
  }
  const matches = fs
    .readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assets, name))
    .filter((filePath) => {
      const source = fs.readFileSync(filePath, "utf8");
      return (
        source.includes("queryKey:[`chatgpt-models`]") &&
        source.includes("queryKey:[`appgen`,`access`]") &&
        source.includes("getInternalModelSlugsResponse")
      );
    });
  if (matches.length !== 1) {
    throw new Error(
      `${platform} chat catalog bundle: expected one candidate, found ${matches.length}`,
    );
  }
  return { path: matches[0], source: fs.readFileSync(matches[0], "utf8") };
}

function stripBrokenClassHelper(source) {
  // Old builds injected `function CDRMergeChatModels` into a class body, which
  // throws SyntaxError and freezes the HTML startup-loader forever.
  const start = source.indexOf(BROKEN_CLASS_HELPER);
  if (start === -1) return source;
  const helperMarker = `}/* ${MARKER}:helper */`;
  const helperMarkerV1 = "}/* codex-rebuild:chat-catalog-v1:helper */";
  let end = source.indexOf(helperMarker, start);
  let markerLen = helperMarker.length;
  if (end === -1) {
    end = source.indexOf(helperMarkerV1, start);
    markerLen = helperMarkerV1.length;
  }
  if (end === -1) {
    throw new Error("broken CDRMergeChatModels helper found but helper marker missing");
  }
  // Keep the closing `}` of the previous class method; drop `function … }/* helper */`.
  return source.slice(0, start + 1) + source.slice(end + markerLen);
}

function verify(source, bundlePath) {
  if (source.includes(BROKEN_CLASS_HELPER) || source.includes("function CDRMergeChatModels(")) {
    throw new Error(
      `${relPath(bundlePath)} still has illegal class-body CDRMergeChatModels helper`,
    );
  }
  for (const item of [
    `${MARKER}:sites`,
    `${MARKER}:internal`,
    `${MARKER}:iim`,
    `${MARKER}:merge`,
    `${MARKER}:placeholder`,
    MERGE_IIFE,
    "selectedLabel:`Sol High`",
    "selectedLabel:`Sol Medium`",
    "selectedLabel:`5.5 Instant`",
    "slug:`gpt-5.4`",
    "slug:`o3`",
    "enabled:!0,queryFn:()=>e.get(aB).internalModels()",
    "iim:!0,include_icons:!1",
  ]) {
    if (!source.includes(item)) {
      throw new Error(`${relPath(bundlePath)} missing chat catalog invariant: ${item}`);
    }
  }
  if (source.includes(SITES_ATOM_FROM) || source.includes(MODELS_FN_FROM)) {
    throw new Error(`${relPath(bundlePath)} still has locked Sites/model catalog anchors`);
  }
  if (source.includes(BROKEN_MODELS_CALL)) {
    throw new Error(`${relPath(bundlePath)} still calls removed CDRMergeChatModels helper`);
  }
  if (source.includes(MARKER_V1) && !source.includes(MARKER)) {
    throw new Error(`${relPath(bundlePath)} still on chat-catalog v1`);
  }
}

function patch(source, bundlePath) {
  let next = stripBrokenClassHelper(source);

  if (
    next.includes(`${MARKER}:merge`) &&
    next.includes(MERGE_IIFE) &&
    !next.includes(BROKEN_CLASS_HELPER) &&
    !next.includes("function CDRMergeChatModels(")
  ) {
    verify(next, bundlePath);
    return { source: next, changed: next !== source };
  }

  if (!next.includes(`${MARKER}:sites`) && !next.includes(SITES_ATOM_TO)) {
    next = replaceOneOf(next, [SITES_ATOM_FROM, SITES_ATOM_V1], SITES_ATOM_TO, "force Sites available");
  }
  if (!next.includes(`${MARKER}:internal`) && !next.includes(INTERNAL_MODELS_TO)) {
    next = replaceOneOf(
      next,
      [INTERNAL_MODELS_FROM, INTERNAL_MODELS_V1],
      INTERNAL_MODELS_TO,
      "enable internal ChatGPT models",
    );
  }
  if (!next.includes(`${MARKER}:iim`) && !next.includes(MODELS_IIM_TO)) {
    next = replaceOneOf(next, [MODELS_IIM_FROM, MODELS_IIM_V1], MODELS_IIM_TO, "request full /models catalog");
  }

  if (next.includes(BROKEN_MODELS_CALL)) {
    const brokenWithMarker = BROKEN_MODELS_CALL + `/* ${MARKER}:merge */`;
    if (next.includes(brokenWithMarker)) {
      next = replaceExactly(
        next,
        brokenWithMarker,
        MODELS_FN_TO,
        "replace broken CDRMergeChatModels call with IIFE",
      );
    } else {
      next = replaceExactly(
        next,
        BROKEN_MODELS_CALL,
        MODELS_FN_TO,
        "replace bare broken CDRMergeChatModels call with IIFE",
      );
    }
  } else if (next.includes(MODELS_FN_FROM)) {
    next = replaceExactly(next, MODELS_FN_FROM, MODELS_FN_TO, "inject Chat model merge IIFE");
  } else if (!next.includes(MERGE_IIFE)) {
    throw new Error(`${relPath(bundlePath)} models() anchor missing for merge IIFE`);
  }

  if (next.includes(PLACEHOLDER_FROM)) {
    next = replaceExactly(next, PLACEHOLDER_FROM, PLACEHOLDER_TO, "Chat model placeholder list");
  } else if (!next.includes(`${MARKER}:placeholder`)) {
    throw new Error(`${relPath(bundlePath)} Chat model placeholder anchor missing`);
  }

  // Drop stale v1 markers so verify can require v2-only state.
  next = next.split(MARKER_V1).join(MARKER);

  verify(next, bundlePath);
  return { source: next, changed: true };
}

function main() {
  const args = process.argv.slice(2);
  const platform =
    args.find((arg) => ["mac-x64", "mac-arm64", "win", "unix"].includes(arg)) ?? SUPPORTED_PLATFORM;
  const checkOnly = args.includes("--check");
  if (platform !== SUPPORTED_PLATFORM) {
    throw new Error(`Chat catalog patch currently supports only ${SUPPORTED_PLATFORM}`);
  }
  const target = findCatalogBundle(platform);
  const next = patch(target.source, target.path);
  console.log(`  [${platform}] ${relPath(target.path)}`);
  if (!next.changed) {
    console.log("    [ok] chat catalog / Sites unlock already installed");
    return;
  }
  if (checkOnly) {
    console.log("    [?] chat catalog / Sites unlock would be installed");
    return;
  }
  fs.writeFileSync(target.path, next.source);
  verify(fs.readFileSync(target.path, "utf8"), target.path);
  console.log("    [ok] unlocked Sites + forced Chat model catalog (Sol/5.5/5.4/o3)");
}

module.exports = { MARKER, findCatalogBundle, patch, verify };

if (require.main === module) main();

