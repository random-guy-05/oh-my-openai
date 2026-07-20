#!/usr/bin/env node
"use strict";
/**
 * v40: Chat mode uses ChatGPT (Chat usage + Chat models), not AppServer/Codex.
 *
 * Root cause: local-canonical forced native productMode to always be `codex`,
 * so Chat was only an AppServer model preset → Codex/Work usage.
 *
 * Fix:
 * 1) Mode select Chat → sticky chat + navigate to `/` (ChatGPT home, null origin)
 * 2) Layout effect no longer force-codex while sticky is chat; sync work/codex surfaces
 * 3) Force ChatGPT /models catalog to Sol High/Medium, 5.5 Instant, o3
 * 4) Strip broken v38 AppServer picker injection (Work/Codex keep native Cg)
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
const MARKER = "codex-rebuild:chat-usage-v40";

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
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|chat-usage-v40/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
    }
  } catch {}
}

function patchPage(src) {
  if (src.includes(MARKER + ":mode")) {
    console.log("page already v40");
    return src;
  }

  let out = src;

  // Stop force-codex while Chat sticky; keep Chat on ChatGPT `/`
  out = replaceOnce(
    out,
    "(0,BI.useLayoutEffect)(()=>{if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);u=e=>{let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};",
    "(0,BI.useLayoutEffect)(()=>{/* " +
      MARKER +
      ":sync */if(CDRMode===`chat`){try{let p=location.pathname||``;if(p.startsWith(`/local`)||p.startsWith(`/remote`))a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}})}catch{}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,r,i,a,s]);u=e=>{/* " +
      MARKER +
      ":mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};",
    "chat usage mode routing",
  );

  return out;
}

function stripV38Settings(src) {
  let out = src;
  if (!(out.includes("chat-models-v38") || out.includes("CDRChatY"))) {
    return out;
  }

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

  assert(!out.includes("chat-models-v38"), "v38 remnants");
  assert(!out.includes("CDRChatY"), "CDRChatY remnant");
  return out;
}

function patchSettings(src) {
  let out = stripV38Settings(src);
  if (out.includes(MARKER + ":picker-mode")) {
    console.log("settings already v40 mode subscribe");
    return out;
  }

  // After stripV38 the mk runtime IIFE ends with: })();let o=n(O);...f=Rl(e)
  const afterRuntime =
    "})();let o=n(O);n(Nt);let c=s(xk),l=b(re.showUltraInModelPickerSlider),[u,d]=(0,_k.useState)(null),f=Rl(e)";
  assert(out.includes(afterRuntime), "settings runtime end anchor missing after v38 strip");
  out = replaceOnce(
    out,
    afterRuntime,
    "})();let[CDRMode,CDRSetMode]=(0,_k.useState)(()=>CDRRuntime.mode());(0,_k.useEffect)(()=>CDRRuntime.subscribe(CDRSetMode),[]);/* " +
      MARKER +
      ":picker-mode */let o=n(O);n(Nt);let c=s(xk),l=b(re.showUltraInModelPickerSlider),[u,d]=(0,_k.useState)(null),f=Rl(e)",
    "picker mode subscribe",
  );

  // Reference CDRMode so Work/Codex curated list re-evaluates (te stays Cg)
  out = replaceOnce(
    out,
    "te=Cg(y,l),ne=Ug(y)",
    "te=(CDRMode,Cg(y,l)),ne=Ug(y)/* " + MARKER + ":te */",
    "te mode dependency",
  );

  return out;
}

const MERGE_HELPER =
  "function CDRMergeChatModels(e){const t=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}];const n=new Set;const r=[];for(const e of[...t,...(e&&e.options)||[]]){const k=`${e.slug}:${e.thinkingEffort??``}:${e.lane??``}`;n.has(k)||(n.add(k),r.push(e))}return{...e,defaultModelSlug:`gpt-5.6-sol`,options:r}}/* " +
  MARKER +
  ":helper */";

function patchChatCatalog(src) {
  if (src.includes(MARKER + ":merge")) {
    console.log("chat catalog already v40");
    return src;
  }
  let out = src;

  out = replaceOnce(
    out,
    "this.safeGet(`/models`,{parameters:{query:{iim:!1,include_icons:!1}}})",
    "this.safeGet(`/models`,{parameters:{query:{iim:!0,include_icons:!1}}})/* " +
      MARKER +
      ":iim */",
    "iim true",
  );

  out = replaceOnce(
    out,
    "async models(){return Hn(await this.request.getModelsResponse())}",
    "async models(){return CDRMergeChatModels(Hn(await this.request.getModelsResponse()))}/* " +
      MARKER +
      ":merge */",
    "models merge",
  );

  if (!out.includes("function CDRMergeChatModels(")) {
    out = MERGE_HELPER + out;
  }

  out = replaceOnce(
    out,
    "ir=`auto`,ar=[{description:null,lane:`instant`,selectedLabel:`GPT-5 Instant`,slug:ir,title:`Instant`},{description:null,lane:`thinking`,selectedLabel:`GPT-5 Thinking`,slug:`gpt-5-thinking`,title:`Thinking`}],or={defaultModelSlug:ir,options:ar,versionOptions:[{defaultModelSlug:ir,id:`gpt-5`,label:`GPT-5`,modelSlugByLane:{auto:ir,thinking:`gpt-5-thinking`},options:ar,slugs:[ir,`gpt-5-thinking`]}]}",
    "ir=`gpt-5.6-sol`,ar=[{description:null,lane:`thinking`,selectedLabel:`Sol High`,slug:`gpt-5.6-sol`,title:`Sol High`,thinkingEffort:`high`},{description:null,lane:`thinking`,selectedLabel:`Sol Medium`,slug:`gpt-5.6-sol`,title:`Sol Medium`,thinkingEffort:`medium`},{description:null,lane:`instant`,selectedLabel:`5.5 Instant`,slug:`gpt-5.5`,title:`5.5 Instant`},{description:null,lane:`thinking`,selectedLabel:`o3`,slug:`o3`,title:`o3`}],or={defaultModelSlug:ir,options:ar}/* " +
      MARKER +
      ":placeholder */",
    "placeholder catalog",
  );

  return out;
}

function verify(page, settings, chat) {
  assert(page.includes(MARKER + ":mode"), "page missing mode");
  assert(page.includes(MARKER + ":sync"), "page missing sync");
  assert(page.includes("a(`/`,{state:{chatGptProjectId:null"), "missing chat navigate");
  assert(!page.includes("if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`"), "force-codex still present");
  assert(settings.includes(MARKER + ":picker-mode"), "settings missing mode subscribe");
  assert(!settings.includes("chat-models-v38"), "v38 still in settings");
  assert(chat.includes(MARKER + ":merge"), "chat missing merge");
  assert(chat.includes("selectedLabel:`5.5 Instant`"), "missing Instant");
  assert(chat.includes("selectedLabel:`Sol High`"), "missing Sol High");
  assert(chat.includes("iim:!0"), "missing iim");
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
  console.log("verify ok");
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-usage-v40.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of [
    path.join(
      os.homedir(),
      "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
    ),
    "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
  ]) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v40-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
let page = fs.readFileSync(PAGE, "utf8");
let settings = fs.readFileSync(SETTINGS, "utf8");
let chat = fs.readFileSync(CHAT, "utf8");
page = patchPage(page);
settings = patchSettings(settings);
chat = patchChatCatalog(chat);
fs.writeFileSync(PAGE, page);
fs.writeFileSync(SETTINGS, settings);
fs.writeFileSync(CHAT, chat);
verify(page, settings, chat);
if (process.argv.includes("--check")) process.exit(0);
install();
console.log(
  "done — quit/reopen Codex; Chat → `/` ChatGPT (Chat usage + Sol/Instant/o3); Work/Codex use their surfaces",
);
