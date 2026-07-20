#!/usr/bin/env node
"use strict";
/**
 * v41: Make Chat mode actually use ChatGPT (Chat usage + web model list).
 *
 * Evidence from live app: still AppServer power slider (light/xhigh/max) =
 * still on Codex surface. v40 never wrote (anchor fail) so nothing propagated.
 *
 * This script:
 * 1) Routes Chat → `/` ChatGPT home (null origin) — Chat usage
 * 2) Forces ChatGPT catalog options: Sol High/Medium, 5.5 Instant, 5.4, o3
 *    (replaces options; no Codex effort ladder)
 * 3) Strips v38 AppServer catalog injection
 * 4) Packs, installs BOTH live asars, verifies markers inside installed asar
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const acorn = require("acorn");
const { execFileSync, execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const ASAR_ROOT = path.join(ROOT, "src/mac-x64/_asar");
const PAGE = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
);
const SETTINGS = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const CHAT = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);
const MARKER = "codex-rebuild:chat-usage-v41";

const LIVE_ASARS = [
  path.join(
    os.homedir(),
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];

function assert(c, m) {
  if (!c) throw new Error(m);
}
function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1, got ${n}`);
  return src.replace(from, to);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher|Codex\.app|Codex\.payload/.test(line))
        continue;
      if (/cursor-agent|grep|chat-usage-v41|_apply-chat/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function patchPage(src) {
  if (src.includes(MARKER + ":mode")) {
    console.log("page already v41");
    return src;
  }
  // Accept v40 partial or original force-codex
  if (src.includes("chat-usage-v40:mode")) {
    return src
      .split("chat-usage-v40:mode")
      .join(MARKER + ":mode")
      .split("chat-usage-v40:sync")
      .join(MARKER + ":sync");
  }

  return replaceOnce(
    src,
    "(0,BI.useLayoutEffect)(()=>{if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);u=e=>{let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};",
    "(0,BI.useLayoutEffect)(()=>{/* " +
      MARKER +
      ":sync */if(CDRMode===`chat`){try{let p=location.pathname||``;if(p.startsWith(`/local`)||p.startsWith(`/remote`))a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}})}catch{}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,r,i,a,s]);u=e=>{/* " +
      MARKER +
      ":mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};",
    "chat→ChatGPT home routing",
  );
}

function stripV38Settings(src) {
  let out = src;
  if (!(out.includes("chat-models-v38") || out.includes("CDRChatY"))) return out;

  if (out.includes("[CDRChatY,CDRSetChatY]")) {
    out = replaceOnce(
      out,
      "[u,d]=(0,_k.useState)(null),[CDRChatY,CDRSetChatY]=(0,_k.useState)(null),f=Rl(e)",
      "[u,d]=(0,_k.useState)(null),f=Rl(e)",
      "strip CDRChatY",
    );
  }

  const yStart = out.indexOf(
    "{data:_,status:v}=Ga({hostId:f.hostId}),y=(()=>{/* codex-rebuild:chat-models-v38:y */",
  );
  if (yStart >= 0) {
    const yEnd = out.indexOf("return _?.models})(),{modelSettings:S", yStart);
    assert(yEnd > yStart, "v38 y end missing");
    out =
      out.slice(0, yStart) +
      "{data:_,status:v}=Ga({hostId:f.hostId}),y=_?.models,{modelSettings:S" +
      out.slice(yEnd + "return _?.models})(),{modelSettings:S".length);
  }

  if (out.includes("chat-models-v38:te")) {
    out = replaceOnce(
      out,
      "te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l),ne=Ug(y)/* codex-rebuild:chat-models-v38:te */",
      "te=Cg(y,l),ne=Ug(y)",
      "strip v38 te",
    );
  }

  const loadStart = out.indexOf(
    "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);(0,_k.useEffect)(()=>{/* codex-rebuild:chat-models-v38:load */",
  );
  if (loadStart >= 0) {
    const loadEnd = out.indexOf("},[CDRRuntime,o,V_]);let de=", loadStart);
    assert(loadEnd > loadStart, "v38 load end missing");
    out =
      out.slice(0, loadStart) +
      "(0,_k.useEffect)(()=>CDRRuntime.registerModelController(({model:CDRModel,reasoningEffort:CDREffort})=>w(CDRModel,CDREffort)),[CDRRuntime,w]);let de=" +
      out.slice(loadEnd + "},[CDRRuntime,o,V_]);let de=".length);
  }

  assert(!out.includes("chat-models-v38"), "v38 remnants after strip");
  assert(!out.includes("CDRChatY"), "CDRChatY remnant after strip");
  return out;
}

function patchSettings(src) {
  let out = stripV38Settings(src);

  // Already on v40/v41 clean AppServer picker — just upgrade markers
  if (out.includes("te=(CDRMode,Cg(y,l)),ne=Ug(y)")) {
    out = out
      .split("codex-rebuild:chat-usage-v40:te")
      .join(MARKER + ":te")
      .split("codex-rebuild:chat-usage-v40:picker-mode")
      .join(MARKER + ":picker-mode");
    if (!out.includes(MARKER + ":picker-clean")) {
      out = replaceOnce(
        out,
        "te=(CDRMode,Cg(y,l)),ne=Ug(y)/* " + MARKER + ":te */",
        "te=Cg(y,l),ne=Ug(y)/* " + MARKER + ":picker-clean */",
        "normalize te",
      );
    }
    return out;
  }

  if (out.includes(MARKER + ":picker-clean")) {
    console.log("settings already v41");
    return out;
  }

  assert(
    out.includes("te=Cg(y,l),ne=Ug(y)") || out.includes("te=(CDRMode,Cg(y,l)),ne=Ug(y)"),
    "expected clean te after strip; got: " +
      (() => {
        const i = out.indexOf(",te=");
        return i >= 0 ? out.slice(i, i + 100) : "(no te=)";
      })(),
  );

  if (out.includes("te=Cg(y,l),ne=Ug(y)") && !out.includes(MARKER)) {
    out = replaceOnce(
      out,
      "te=Cg(y,l),ne=Ug(y)",
      "te=Cg(y,l),ne=Ug(y)/* " + MARKER + ":picker-clean */",
      "mark clean picker",
    );
  }
  return out;
}

// REPLACE options entirely — do not merge API internals (max/xhigh noise)
const MERGE_HELPER =
  "function CDRMergeChatModels(e){const t=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5.4`,slug:`gpt-5.4`,title:`5.4`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}];return{defaultModelSlug:`gpt-5.6-sol`,options:t,internalOptions:[],versionOptions:[],sliderSettings:[]}}/* " +
  MARKER +
  ":helper */";

function patchChatCatalog(src) {
  let out = src;

  // Always replace helper body with REPLACE semantics
  if (out.includes("function CDRMergeChatModels(")) {
    const start = out.indexOf("function CDRMergeChatModels(");
    // find end marker — v40 or v41
    let end = out.indexOf("/* " + MARKER + ":helper */", start);
    if (end < 0) end = out.indexOf("/* codex-rebuild:chat-usage-v40:helper */", start);
    assert(start >= 0 && end > start, "helper end marker missing");
    const endTok =
      out.includes("/* " + MARKER + ":helper */", start) &&
      out.indexOf("/* " + MARKER + ":helper */", start) === end
        ? "/* " + MARKER + ":helper */"
        : "/* codex-rebuild:chat-usage-v40:helper */";
    out = out.slice(0, start) + MERGE_HELPER + out.slice(end + endTok.length);
  }

  out = out
    .split("codex-rebuild:chat-usage-v40:")
    .join(MARKER + ":")
    .split("codex-rebuild:chat-models-v37:publish")
    .join(MARKER + ":publish-old");

  if (out.includes(MARKER + ":merge") && out.includes("internalOptions:[]") && out.includes("sliderSettings:[]")) {
    console.log("chat catalog already v41 replace-merge");
    // still ensure models() wrapped
  } else if (!out.includes("function CDRMergeChatModels(")) {
    // fresh path below
  }

  if (!out.includes(MARKER + ":iim") && !out.includes("iim:!0,include_icons:!1")) {
    out = replaceOnce(
      out,
      "this.safeGet(`/models`,{parameters:{query:{iim:!1,include_icons:!1}}})",
      "this.safeGet(`/models`,{parameters:{query:{iim:!0,include_icons:!1}}})/* " +
        MARKER +
        ":iim */",
      "iim",
    );
  } else if (out.includes("iim:!0") && !out.includes(MARKER + ":iim")) {
    // already enabled from v40
  }

  if (
    out.includes(
      "async models(){return Hn(await this.request.getModelsResponse())}",
    )
  ) {
    out = replaceOnce(
      out,
      "async models(){return Hn(await this.request.getModelsResponse())}",
      "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* " +
        MARKER +
        ":merge */",
      "models merge",
    );
  } else if (
    !out.includes("async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}")
  ) {
    throw new Error("models() neither plain nor wrapped");
  } else if (!out.includes(MARKER + ":merge")) {
    out = out.replace(
      "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* codex-rebuild:chat-usage-v40:merge */",
      "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* " +
        MARKER +
        ":merge */",
    );
  }

  if (!out.includes("function CDRMergeChatModels(")) {
    out = MERGE_HELPER + out;
  }

  const placeholderFrom =
    "ir=`auto`,ar=[{description:null,lane:`instant`,selectedLabel:`GPT-5 Instant`,slug:ir,title:`Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5 Thinking`,slug:`gpt-5-thinking`,title:`Thinking`}],or={defaultModelSlug:ir,options:ar,versionOptions:[{defaultModelSlug:ir,id:`gpt-5`,label:`GPT-5`,modelSlugByLane:{auto:ir,thinking:`gpt-5-thinking`},options:ar,slugs:[ir,`gpt-5-thinking`]}]}";
  const placeholderTo =
    "ir=`gpt-5.6-sol`,ar=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5.4`,slug:`gpt-5.4`,title:`5.4`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}],or={defaultModelSlug:ir,options:ar}/* " +
    MARKER +
    ":placeholder */";

  if (out.includes(placeholderFrom)) {
    out = replaceOnce(out, placeholderFrom, placeholderTo, "placeholder");
  } else if (!out.includes("selectedLabel:`5.5 Instant`")) {
    throw new Error("placeholder anchor missing and Instant not present");
  }

  // Upgrade leftover v40 placeholder marker
  out = out.split("codex-rebuild:chat-usage-v40:placeholder").join(MARKER + ":placeholder");

  assert(out.includes("internalOptions:[]"), "merge must clear internalOptions");
  assert(out.includes("sliderSettings:[]"), "merge must clear sliderSettings");
  return out;
}

function verify(page, settings, chat) {
  assert(page.includes(MARKER + ":mode"), "page missing mode routing");
  assert(page.includes("a(`/`,{state:{chatGptProjectId:null"), "missing ChatGPT navigate");
  assert(
    !page.includes(
      "if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`",
    ),
    "force-codex still present",
  );
  assert(settings.includes(MARKER + ":picker-clean"), "settings not cleaned");
  assert(!settings.includes("chat-models-v38"), "v38 still in settings");
  assert(chat.includes("function CDRMergeChatModels("), "missing merge helper");
  assert(chat.includes("selectedLabel:`5.5 Instant`"), "missing Instant");
  assert(chat.includes("selectedLabel:`Sol High`"), "missing Sol High");
  assert(chat.includes("selectedLabel:`GPT-5.4`"), "missing 5.4");
  assert(chat.includes("internalOptions:[]"), "merge must replace not append");
  assert(chat.includes("sliderSettings:[]"), "merge must clear sliderSettings");
  for (const [label, src] of [
    ["page", page],
    ["settings", settings],
    ["chat", chat],
  ]) {
    try {
      acorn.parse(src, { ecmaVersion: "latest", sourceType: "module" });
    } catch (err) {
      throw new Error(`${label} parse failed: ${err.message}`);
    }
  }
  console.log("source verify ok");
}

function verifyInstalledAsar(asarPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cdr-v41-"));
  try {
    execFileSync("npx", ["asar", "extract", asarPath, tmp], {
      cwd: ROOT,
      stdio: "pipe",
    });
    const page = fs.readFileSync(
      path.join(
        tmp,
        "webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
      ),
      "utf8",
    );
    const chat = fs.readFileSync(
      path.join(
        tmp,
        "webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
      ),
      "utf8",
    );
    assert(page.includes(MARKER + ":mode"), `${asarPath} page missing v41`);
    assert(chat.includes("selectedLabel:`5.5 Instant`"), `${asarPath} chat missing Instant`);
    assert(chat.includes("internalOptions:[]"), `${asarPath} chat merge wrong`);
    console.log("installed verify ok", asarPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-usage-v41.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing", packed);
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE_ASARS) {
    if (!fs.existsSync(dest)) {
      console.log("skip missing", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v41-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest, "size", fs.statSync(dest).size);
    verifyInstalledAsar(dest);
  }
}

killCodex();

assert(fs.existsSync(PAGE), "PAGE missing");
assert(fs.existsSync(SETTINGS), "SETTINGS missing");
assert(fs.existsSync(CHAT), "CHAT missing");

let page = fs.readFileSync(PAGE, "utf8");
let settings = fs.readFileSync(SETTINGS, "utf8");
let chat = fs.readFileSync(CHAT, "utf8");

page = patchPage(page);
settings = patchSettings(settings);
chat = patchChatCatalog(chat);

fs.writeFileSync(PAGE, page);
fs.writeFileSync(SETTINGS, settings);
fs.writeFileSync(CHAT, chat);
console.log("wrote source patches");

verify(page, settings, chat);

if (process.argv.includes("--check")) {
  console.log("check-only ok");
  process.exit(0);
}

install();
console.log(
  "\nSUCCESS — quit Codex fully, reopen /Applications/Codex.app\n" +
    "Chat must open ChatGPT home `/` with: Sol High, Sol Medium, 5.5 Instant, GPT-5.4, o3\n" +
    "No light / xhigh / max (those are Codex AppServer efforts).",
);
