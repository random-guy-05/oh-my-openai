#!/usr/bin/env node
"use strict";

/**
 * v15: Chat keeps Work's sidebar; sticky mode is source of truth; Chat→Codex works;
 * origin never overrides Codex /local; send button colors by mode.
 */
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const REBUILD =
  "/Users/admin/Documents/Codex/2026-07-15/re/work/CodexDesktop-Rebuild-Current";
const ASSETS = path.join(REBUILD, "src/mac-x64/_asar/webview/assets");
const ASAR_ROOT = path.join(REBUILD, "src/mac-x64/_asar");
const PAGE = path.join(ASSETS, "app-initial~app-main~page-ClBbNyfy.js");
const ORIGIN = path.join(
  ASSETS,
  "app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);
const CSS = path.join(ASSETS, "app-Djw8ehxS.css");

function mustReplace(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1, found ${count}`);
  return source.split(from).join(to);
}

function killCodex() {
  const ps = execFileSync("/bin/ps", ["auxww"], { encoding: "utf8" });
  for (const line of ps.split("\n")) {
    if (
      !(
        line.includes("CodexDesktop-Rebuild/Codex.app/Contents/MacOS/ChatGPT") ||
        line.includes("/Applications/Codex.app/Contents/MacOS/CodexLauncher")
      )
    ) {
      continue;
    }
    if (line.includes("Helper") || line.includes("Frameworks")) continue;
    const pid = Number(line.trim().split(/\s+/)[1]);
    if (!Number.isFinite(pid)) continue;
    console.log("kill", pid);
    try {
      process.kill(pid, "SIGTERM");
    } catch {}
  }
}

const MODE_SELECT_FROM = `let ae=u?(0,iz.jsxs)(\`div\`,{className:\`ml-2 flex items-center\`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{let CDRPath=CDRChatLocation.pathname||\`\`,CDRSearch=CDRChatLocation.search||\`\`,CDRLocalId=CDRPath.startsWith(\`/local/\`)?decodeURIComponent(CDRPath.slice(7).split(\`?\`)[0]):null,CDRChatId=CDRPath.startsWith(\`/work/conversation/\`)?decodeURIComponent(CDRPath.slice(20).split(\`?\`)[0]):null;try{localStorage.setItem(\`cdr-product-mode\`,e)}catch{}if(e===\`chat\`){if(CDRLocalId){Aw(a,CDRLocalId.includes(\`:\`)?CDRLocalId:\`local:\${CDRLocalId}\`,qx(),CDRChatNavigate);return}if(CDRChatId){let sp=new URLSearchParams(CDRSearch);sp.set(\`mode\`,\`chat\`);CDRChatNavigate({pathname:CDRPath,search:\`?\`+sp.toString()},{replace:!0});return}if(CDRPath===\`/\`||CDRPath===\`\`||CDRPath===\`/chat\`){CDRChatNavigate(\`/chat?mode=chat\`);return}CDRChatNavigate({pathname:CDRPath,search:CDRSearch.includes(\`mode=chat\`)?CDRSearch:\`\${CDRSearch?CDRSearch+\`&\`:\`?\`}mode=chat\`},{replace:!0});return}Iee(a,e===\`work\`?vf:Tr);if(e===\`work\`){if(CDRLocalId){Aw(a,CDRLocalId.includes(\`:\`)?CDRLocalId:\`local:\${CDRLocalId}\`,qx(),CDRChatNavigate);return}if(CDRChatId){let sp=new URLSearchParams(CDRSearch);sp.delete(\`mode\`);let q=sp.toString();CDRChatNavigate({pathname:CDRPath,search:q?\`?\`+q:\`\`},{replace:!0});return}return}if(e===\`codex\`){if(CDRChatId){let local=null;try{let m=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`);local=m.byChat?.[CDRChatId]||null;if(!local){let old=JSON.parse(localStorage.getItem(\`cdr-codex-chatgpt-map\`)||\`{}\`);for(let[k,v]of Object.entries(old))if(v===CDRChatId){local=k;break}}}catch{}if(local){Aw(a,local,qx(),CDRChatNavigate);return}}return}}}),(0,iz.jsx)(vOe,{})]}):null;`;

const MODE_SELECT_TO = `let ae=u?(0,iz.jsxs)(\`div\`,{className:\`ml-2 flex items-center\`,children:[(0,iz.jsx)(ROe,{mode:I,onModeSelect:e=>{let CDRPath=CDRChatLocation.pathname||\`\`,CDRSearch=CDRChatLocation.search||\`\`,CDRLocalId=CDRPath.startsWith(\`/local/\`)?decodeURIComponent(CDRPath.slice(7).split(\`?\`)[0]):null,CDRChatId=CDRPath.startsWith(\`/work/conversation/\`)?decodeURIComponent(CDRPath.slice(20).split(\`?\`)[0]):null;try{localStorage.setItem(\`cdr-product-mode\`,e);document.documentElement.setAttribute(\`data-codex-product-mode\`,e)}catch{}if(e===\`chat\`){Iee(a,vf);if(CDRLocalId){Aw(a,CDRLocalId.includes(\`:\`)?CDRLocalId:\`local:\${CDRLocalId}\`,qx(),CDRChatNavigate);return}if(CDRPath===\`/chat\`){CDRChatNavigate(\`/\`,{replace:!0});return}if(CDRChatId){let sp=new URLSearchParams(CDRSearch);sp.delete(\`mode\`);let q=sp.toString();CDRChatNavigate({pathname:CDRPath,search:q?\`?\`+q:\`\`},{replace:!0});return}return}Iee(a,e===\`work\`?vf:Tr);if(e===\`work\`){if(CDRLocalId){Aw(a,CDRLocalId.includes(\`:\`)?CDRLocalId:\`local:\${CDRLocalId}\`,qx(),CDRChatNavigate);return}if(CDRPath===\`/chat\`){CDRChatNavigate(\`/\`,{replace:!0});return}if(CDRChatId){let sp=new URLSearchParams(CDRSearch);sp.delete(\`mode\`);let q=sp.toString();CDRChatNavigate({pathname:CDRPath,search:q?\`?\`+q:\`\`},{replace:!0});return}return}if(e===\`codex\`){if(CDRLocalId){Aw(a,CDRLocalId.includes(\`:\`)?CDRLocalId:\`local:\${CDRLocalId}\`,qx(),CDRChatNavigate);return}if(CDRChatId){let local=null;try{let m=JSON.parse(localStorage.getItem(\`cdr-thread-map\`)||\`{}\`);local=m.byChat?.[CDRChatId]||null;if(!local){let old=JSON.parse(localStorage.getItem(\`cdr-codex-chatgpt-map\`)||\`{}\`);for(let[k,v]of Object.entries(old))if(v===CDRChatId){local=k;break}}}catch{}if(local){Aw(a,local,qx(),CDRChatNavigate);return}CDRChatNavigate(\`/\`,{replace:!0});return}if(CDRPath===\`/chat\`||CDRPath.startsWith(\`/work/\`)||(CDRSearch||\`\`).includes(\`mode=chat\`)){CDRChatNavigate(\`/\`,{replace:!0});return}return}}}),(0,iz.jsx)(vOe,{})]}):null;`;

const ROUTE_STATE_FROM = `CDRChatModeFromRoute=CDRChatLocation.pathname===\`/chat\`||new URLSearchParams(CDRChatLocation.search).get(\`mode\`)===\`chat\`,CDRChatModeStored=(()=>{try{return localStorage.getItem(\`cdr-product-mode\`)===\`chat\`}catch{return!1}})(),CDRChatMode=CDRChatModeFromRoute||CDRChatModeStored;(0,rz.useEffect)(()=>{if(!CDRChatModeFromRoute)return;try{localStorage.setItem(\`cdr-product-mode\`,\`chat\`)}catch{}},[CDRChatModeFromRoute]);`;

const ROUTE_STATE_TO = `CDRSticky=(()=>{try{return localStorage.getItem(\`cdr-product-mode\`)}catch{return null}})(),CDRChatMode=CDRSticky===\`chat\`;(0,rz.useEffect)(()=>{try{let m=localStorage.getItem(\`cdr-product-mode\`)||(CDRChatLocation.pathname.startsWith(\`/local/\`)?\`codex\`:\`work\`);document.documentElement.setAttribute(\`data-codex-product-mode\`,m)}catch{}},[CDRSticky,CDRChatLocation.pathname,CDRChatLocation.search]);`;

const ORIGIN_FROM = `((o)=>{/* codex-rebuild:chat-origin-v13 */try{let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`)return null;if(mode===\`work\`)return \`tpp\`}catch{}return o})`;
const ORIGIN_TO = `((o)=>{/* codex-rebuild:chat-origin-v15 */try{let path=typeof location<\`u\`&&location.pathname||\`\`;if(path.startsWith(\`/local\`))return o;let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`)return null;if(mode===\`work\`)return \`tpp\`;if(mode===\`codex\`)return o}catch{}return o})`;

const ORIGIN_LP_FROM = `((o)=>{try{let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`)return null;if(mode===\`work\`)return \`tpp\`}catch{}return o})`;
const ORIGIN_LP_TO = `((o)=>{/* codex-rebuild:chat-origin-v15 */try{let path=typeof location<\`u\`&&location.pathname||\`\`;if(path.startsWith(\`/local\`))return o;let mode=localStorage.getItem(\`cdr-product-mode\`);if(mode===\`chat\`)return null;if(mode===\`work\`)return \`tpp\`;if(mode===\`codex\`)return o}catch{}return o})`;

const CSS_BLOCK = `
/* codex-rebuild:native-chat-theme-v15 */
html[data-codex-product-mode="work"] button.h-token-button-composer[type="submit"],
html[data-codex-product-mode="work"] button.extension\\:h-token-button-composer[type="submit"],
html[data-codex-product-mode="work"] span.inline-flex > button[type="submit"] {
  background-color: #2563eb !important;
  color: #fff !important;
  border-color: #2563eb !important;
}
html[data-codex-product-mode="chat"] button.h-token-button-composer[type="submit"],
html[data-codex-product-mode="chat"] button.extension\\:h-token-button-composer[type="submit"],
html[data-codex-product-mode="chat"] span.inline-flex > button[type="submit"] {
  background-color: #dc2626 !important;
  color: #fff !important;
  border-color: #dc2626 !important;
}
html[data-codex-product-mode="codex"] button.h-token-button-composer[type="submit"],
html[data-codex-product-mode="codex"] button.extension\\:h-token-button-composer[type="submit"],
html[data-codex-product-mode="codex"] span.inline-flex > button[type="submit"] {
  background-color: #111111 !important;
  color: #fff !important;
  border-color: #111111 !important;
}
`;

killCodex();

let page = fs.readFileSync(PAGE, "utf8");
page = page.replaceAll("codex-rebuild:native-chat-mode-v14", "codex-rebuild:native-chat-mode-v15");
page = mustReplace(page, MODE_SELECT_FROM, MODE_SELECT_TO, "mode select v15");
page = mustReplace(page, ROUTE_STATE_FROM, ROUTE_STATE_TO, "route state sticky v15");
page = mustReplace(
  page,
  "I=CDRChatMode?`chat`:(j==null&&F===`non_coding`||A===`STEPS_PROSE`?`work`:`codex`)",
  "I=CDRSticky===`chat`?`chat`:CDRSticky===`codex`?`codex`:CDRSticky===`work`?`work`:(j==null&&F===`non_coding`||A===`STEPS_PROSE`?`work`:`codex`)",
  "selector mode from sticky",
);
page = mustReplace(
  page,
  "T=(0,AL.useContext)(oC),CDRChatSource=Jhe({tppOnly:!CDRChatMode}),E=CDRChatMode?{...CDRChatSource,chatTargets:CDRChatSource.chatTargets.map(e=>({...e,route:`${e.route}?mode=chat`})),pinnedTargets:CDRChatSource.pinnedTargets.map(e=>({...e,route:`${e.route}?mode=chat`}))}:CDRChatSource,D=",
  "T=(0,AL.useContext)(oC),E=Jhe({tppOnly:!0}),D=",
  "Work-identical history source",
);
page = mustReplace(
  page,
  "source:`all`});if(CDRChatMode){j={...j,chatKeys:[...E.visibleProjects.map(e=>xE(e.gizmo.id)),...j.chatKeys]}}let M=new Map",
  "source:`all`}),M=new Map",
  "remove Chat extra chatKeys",
);
page = mustReplace(
  page,
  ",R;if(CDRChatMode)R=[(0,yR.jsx)(eAe,{chatMode:!0},`chat`)];else if(m)R=[(0,yR.jsx)(eAe,{},`unified`)];",
  ",R;if(m)R=[(0,yR.jsx)(eAe,{},`unified`)];",
  "no Chat-only history branch",
);
page = mustReplace(
  page,
  "let CDRChatSidebarNode=CDRChatMode&&CDRChatAccountChanging?null:(0,iz.jsx)(IAe,{onScrolledContentUnderHeaderChange:k,scrollContainerRef:g,sidebarMode:CDRChatMode?`work`:`codex`,topContent:ee,chatMode:CDRChatMode},CDRChatMode?`chat:${CDRChatSettledAccount??`anonymous`}`:`codex`);",
  "let CDRChatSidebarNode=(0,iz.jsx)(IAe,{onScrolledContentUnderHeaderChange:k,scrollContainerRef:g,sidebarMode:CDRChatMode||CDRSticky===`work`?`work`:`codex`,topContent:ee});",
  "stable Work sidebar chrome",
);
// New chat in Chat mode → home `/`, not `/chat`
page = mustReplace(
  page,
  "n(`/chat?mode=chat`)",
  "n(`/`)",
  "new chat stays on Work home",
);
// CDRChatHome: same chrome as Work home (no chatMode remount)
if (page.includes("T0,{chatMode:!0}")) {
  page = mustReplace(
    page,
    'return(0,g0.jsx)(h0.Suspense,{fallback:null,children:(0,g0.jsx)(T0,{chatMode:!0},"chat:"+(n??"anonymous"))})',
    "return(0,g0.jsx)(h0.Suspense,{fallback:null,children:(0,g0.jsx)(T0,{})})",
    "Chat home uses Work shell",
  );
}
fs.writeFileSync(PAGE, page);
console.log("patched page");

let origin = fs.readFileSync(ORIGIN, "utf8");
origin = mustReplace(origin, ORIGIN_FROM, ORIGIN_TO, "km origin v15");
origin = mustReplace(origin, ORIGIN_LP_FROM, ORIGIN_LP_TO, "lp origin v15");
fs.writeFileSync(ORIGIN, origin);
console.log("patched origin");

let css = fs.readFileSync(CSS, "utf8");
// strip old theme blocks
css = css.replace(/\n\/\* codex-rebuild:native-chat-theme-v\d+ \*\/[\s\S]*$/m, "");
if (!css.includes("codex-rebuild:native-chat-theme-v15")) {
  css = css.trimEnd() + CSS_BLOCK;
}
fs.writeFileSync(CSS, css);
console.log("patched css");

const packed = path.join(REBUILD, "out", "app-chat-mode-v15.asar");
console.log("packing...");
execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
  cwd: REBUILD,
  stdio: "inherit",
});

const live = [
  path.join(
    process.env.HOME,
    "Library/Application Support/CodexDesktop-Rebuild/Codex.app/Contents/Resources/app.asar",
  ),
  "/Applications/Codex.app/Contents/Resources/Codex.payload/Contents/Resources/app.asar",
];
for (const dest of live) {
  if (!fs.existsSync(dest)) {
    console.log("skip", dest);
    continue;
  }
  fs.copyFileSync(dest, `${dest}.bak-v15-${Date.now()}`);
  fs.copyFileSync(packed, dest);
  console.log("installed", dest);
}

console.log("re-signing...");
execFileSync(
  "node",
  [path.join(__dirname, "_resign-live-runtime.js")],
  { stdio: "inherit" },
);
console.log("done — reopen /Applications/Codex.app");
