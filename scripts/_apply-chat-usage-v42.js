#!/usr/bin/env node
"use strict";
/**
 * v42: Chat mode was sticky-labeled "Chat" but stayed on /local AppServer
 * because sync checked window.location.pathname (always "/" in Electron).
 *
 * Fix:
 * - Detect /local|/remote via react-router am()
 * - On Chat: set home-composer-mode to `chat` (Xr) + replace-navigate to `/`
 * - That loads ChatGPT home composer (null origin) → Chat usage + web models
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
const MARKER = "codex-rebuild:chat-usage-v42";

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
      if (/cursor-agent|grep|chat-usage-v42|_apply-chat/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

const CHAT_GO =
  "try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}a(`/`,{replace:!0,state:{chatGptProjectId:null,chatGptProjectName:null,focusComposerNonce:Date.now()}})";

function patchPage(src) {
  let out = src;

  // Normalize doubled markers from v40→v41 rename bug
  out = out.split("codex-rebuild:codex-rebuild:").join("codex-rebuild:");

  if (out.includes(MARKER + ":mode")) {
    console.log("page already v42");
    return out;
  }

  // Replace whatever v41/v40 sync+mode block is present
  const patterns = [
    // v41 doubled or normal
    "(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:chat-usage-v41:sync */if(CDRMode===`chat`){try{let p=location.pathname||``;if(p.startsWith(`/local`)||p.startsWith(`/remote`))a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}})}catch{}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,r,i,a,s]);u=e=>{/* codex-rebuild:chat-usage-v41:mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};",
    "(0,BI.useLayoutEffect)(()=>{/* codex-rebuild:codex-rebuild:chat-usage-v41:sync */if(CDRMode===`chat`){try{let p=location.pathname||``;if(p.startsWith(`/local`)||p.startsWith(`/remote`))a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}})}catch{}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,r,i,a,s]);u=e=>{/* codex-rebuild:codex-rebuild:chat-usage-v41:mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){a(`/`,{state:{chatGptProjectId:null,chatGptProjectName:null}});return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};",
    // original force-codex
    "(0,BI.useLayoutEffect)(()=>{if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`,startNewConversation:s})},[r,i,a,s]);u=e=>{let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext)};",
  ];

  const replacement =
    "let CDROnLocal=!!am(`/local/:conversationId`),CDROnRemote=!!am(`/remote/:conversationId`);(0,BI.useLayoutEffect)(()=>{/* " +
    MARKER +
    ":sync */if(CDRMode===`chat`){if(CDROnLocal||CDROnRemote){" +
    CHAT_GO +
    "}else{try{Xr(i,`chat`)}catch{}try{localStorage.setItem(`home-composer-mode-v1`,`\"chat\"`)}catch{}}return}let want=CDRMode===`work`?`work`:`codex`;if(r!==want)sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})},[CDRMode,CDROnLocal,CDROnRemote,r,i,a,s]);u=e=>{/* " +
    MARKER +
    ":mode */let CDRNext=CDRRuntime.setMode(e);CDRSetMode(CDRNext);if(e===`chat`){" +
    CHAT_GO +
    ";return}let want=e===`work`?`work`:`codex`;sae(i,{currentMode:r,navigate:a,nextMode:want,startNewConversation:s})};";

  let replaced = false;
  for (const pat of patterns) {
    if (out.includes(pat)) {
      out = replaceOnce(out, pat, replacement, "v42 mode routing");
      replaced = true;
      break;
    }
  }
  assert(replaced, "no known mode-controller anchor matched — inspect live page");
  return out;
}

function verify(page) {
  assert(page.includes(MARKER + ":mode"), "missing v42 mode");
  assert(page.includes(MARKER + ":sync"), "missing v42 sync");
  assert(page.includes("CDROnLocal"), "missing router local match");
  assert(page.includes("Xr(i,`chat`)"), "missing home composer force");
  assert(page.includes("replace:!0"), "missing replace navigate");
  assert(!page.includes("if(CDRMode===`chat`){try{let p=location.pathname"), "still using window.location in chat sync");
  assert(
    !page.includes(
      "if(r!==`codex`)sae(i,{currentMode:r,navigate:a,nextMode:`codex`",
    ),
    "force-codex still present",
  );
  try {
    acorn.parse(page, { ecmaVersion: "latest", sourceType: "module" });
  } catch (err) {
    throw new Error(`page parse failed: ${err.message}`);
  }
  console.log("source verify ok");
}

function verifyInstalledAsar(asarPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cdr-v42-"));
  try {
    execFileSync("npx", ["asar", "extract", asarPath, tmp], {
      cwd: ROOT,
      stdio: "pipe",
    });
    const pageFile = fs
      .readdirSync(path.join(tmp, "webview/assets"))
      .find((f) => f.includes("ogh9jurw") && f.endsWith(".js"));
    const page = fs.readFileSync(
      path.join(tmp, "webview/assets", pageFile),
      "utf8",
    );
    assert(page.includes(MARKER + ":mode"), `${asarPath} missing v42`);
    assert(page.includes("CDROnLocal"), `${asarPath} missing router match`);
    assert(page.includes("Xr(i,`chat`)"), `${asarPath} missing Xr chat`);
    console.log("installed verify ok", asarPath);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-usage-v42.asar");
  fs.mkdirSync(path.dirname(packed), { recursive: true });
  console.log("packing");
  execFileSync("npx", ["asar", "pack", ASAR_ROOT, packed], {
    cwd: ROOT,
    stdio: "inherit",
  });
  for (const dest of LIVE_ASARS) {
    if (!fs.existsSync(dest)) {
      console.log("skip", dest);
      continue;
    }
    fs.copyFileSync(dest, `${dest}.bak-pre-v42-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
    verifyInstalledAsar(dest);
  }
}

killCodex();
assert(fs.existsSync(PAGE), "PAGE missing");
let page = fs.readFileSync(PAGE, "utf8");
page = patchPage(page);
fs.writeFileSync(PAGE, page);
console.log("wrote page");
verify(page);
if (process.argv.includes("--check")) process.exit(0);
install();
console.log(
  "\nSUCCESS — fully quit Codex, reopen.\n" +
    "Selecting Chat must leave /local and open ChatGPT home with Chat models.\n" +
    "If still on a Codex thread URL, the redirect failed — tell me the URL bar path.",
);
