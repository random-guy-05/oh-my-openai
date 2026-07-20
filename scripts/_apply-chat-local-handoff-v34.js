#!/usr/bin/env node
"use strict";
/**
 * Chat mode + /local/:id must hand off to ChatGPT continuity (mapped thread or
 * seeded home) so the Chat model picker is shown — including cold start with
 * sticky chat restored onto a prior Codex route.
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
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
);
const QC = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~quick-chat-window-page-Bg2jp_pK.js",
);

const STICKY_EFFECT_OLD =
  "(0,rz.useEffect)(()=>{if(CDRChatModeFromRoute&&CDRSticky!==`chat`)CDRSetSticky(`chat`);try{let m=CDRSticky||(CDRChatModeFromRoute?`chat`:CDRChatLocation.pathname.startsWith(`/local/`)?`codex`:`work`);document.documentElement.setAttribute(`data-codex-product-mode`,m);}catch{}},[CDRSticky,CDRChatModeFromRoute,CDRChatLocation.pathname,CDRChatLocation.search]);";

const STICKY_EFFECT_NEW =
  "(0,rz.useEffect)(()=>{if(CDRChatModeFromRoute&&CDRSticky!==`chat`)CDRSetSticky(`chat`);try{let ls=null;try{ls=localStorage.getItem(`cdr-product-mode`)}catch{}let m=CDRSticky||(CDRChatModeFromRoute?`chat`:ls===`chat`?`chat`:CDRChatLocation.pathname.startsWith(`/local/`)?`codex`:`work`);document.documentElement.setAttribute(`data-codex-product-mode`,m);}catch{}},[CDRSticky,CDRChatModeFromRoute,CDRChatLocation.pathname,CDRChatLocation.search]);(0,rz.useEffect)(()=>{/* codex-rebuild:chat-local-handoff-v34 */if(!(CDRSticky===`chat`||CDRChatModeFromRoute)){try{for(let i=sessionStorage.length-1;i>=0;i--){let k=sessionStorage.key(i);if(k&&k.startsWith(`cdr-chat-local-handoff:`))sessionStorage.removeItem(k)}}catch{}return}let p=CDRChatLocation.pathname||``;if(!p.startsWith(`/local/`))return;let id=decodeURIComponent(p.slice(7).split(`?`)[0]||``);if(!id)return;try{let k=`cdr-chat-local-handoff:`+id;if(sessionStorage.getItem(k)===`1`)return;sessionStorage.setItem(k,`1`)}catch{}Aw(a,id.includes(`:`)?id:`local:${id}`,qx(),CDRChatNavigate)},[CDRSticky,CDRChatModeFromRoute,CDRChatLocation.pathname]);";

const STICKY_IIFE_OLD =
  "CDRChatSticky=((()=>{/* codex-rebuild:chat-sticky-v32 */try{let p=location.pathname||``,q=new URLSearchParams(location.search).get(`mode`)===`chat`,ls=localStorage.getItem(`cdr-product-mode`),a=document.documentElement.getAttribute(`data-codex-product-mode`);if(a===`work`||a===`codex`)return!1;if(a===`chat`||p===`/chat`||q||ls===`chat`)return!0;return!1}catch{return!1}})()),";

const STICKY_IIFE_NEW =
  "CDRChatSticky=((()=>{/* codex-rebuild:chat-sticky-v34 */try{let p=location.pathname||``,q=new URLSearchParams(location.search).get(`mode`)===`chat`,ls=localStorage.getItem(`cdr-product-mode`),a=document.documentElement.getAttribute(`data-codex-product-mode`);if(ls===`chat`||a===`chat`||p===`/chat`||q)return!0;if(a===`work`||a===`codex`)return!1;return!1}catch{return!1}})()),";

function assert(c, m) {
  if (!c) throw new Error(m);
}

function replaceOnce(src, from, to, label) {
  const n = src.split(from).length - 1;
  assert(n === 1, `${label}: expected 1 match, got ${n}`);
  return src.replace(from, to);
}

function killCodex() {
  try {
    const ps = execSync("ps auxww", { encoding: "utf8" });
    for (const line of ps.split("\n")) {
      if (!/CodexDesktop-Rebuild|CodexLauncher/.test(line)) continue;
      if (/cursor-agent|grep|chat-local-handoff/.test(line)) continue;
      const pid = Number(line.trim().split(/\s+/)[1]);
      if (!Number.isFinite(pid)) continue;
      try {
        process.kill(pid, "SIGKILL");
        console.log("killed", pid);
      } catch {}
    }
  } catch {}
}

function apply() {
  let page = fs.readFileSync(PAGE, "utf8");
  let qc = fs.readFileSync(QC, "utf8");

  if (page.includes("codex-rebuild:chat-local-handoff-v34")) {
    console.log("page handoff already applied");
  } else {
    page = replaceOnce(page, STICKY_EFFECT_OLD, STICKY_EFFECT_NEW, "local handoff effect");
    fs.writeFileSync(PAGE, page);
    console.log("patched page local handoff");
  }

  if (qc.includes("codex-rebuild:chat-sticky-v34")) {
    console.log("qc sticky already applied");
  } else if (qc.includes(STICKY_IIFE_OLD)) {
    qc = replaceOnce(qc, STICKY_IIFE_OLD, STICKY_IIFE_NEW, "sticky IIFE prefer ls=chat");
    fs.writeFileSync(QC, qc);
    console.log("patched qc sticky preference");
  } else {
    throw new Error("qc sticky-v32 anchor missing");
  }
}

function verify() {
  const page = fs.readFileSync(PAGE, "utf8");
  const qc = fs.readFileSync(QC, "utf8");
  assert(page.includes("codex-rebuild:chat-local-handoff-v34"), "missing handoff marker");
  assert(page.includes("cdr-chat-local-handoff:"), "missing handoff session key");
  assert(page.includes("ls===`chat`?`chat`:CDRChatLocation.pathname.startsWith(`/local/`)"), "attr must prefer ls=chat over /local");
  assert(qc.includes("codex-rebuild:chat-sticky-v34"), "missing sticky-v34");
  assert(qc.includes("if(ls===`chat`||a===`chat`||p===`/chat`||q)return!0"), "sticky must prefer ls=chat");
  assert(!qc.includes("if(a===`work`||a===`codex`)return!1;if(a===`chat`"), "old sticky order still present");
  // Do not break unified list / handoff / catalog
  assert(page.includes("chatMode:!1"), "unified list broken");
  assert(qc.includes("codex-rebuild:catalog-v33") || qc.includes("codex-rebuild:catalog-v32"), "catalog remap missing");
  acorn.parse(page, { ecmaVersion: "latest", sourceType: "module" });
  acorn.parse(qc, { ecmaVersion: "latest", sourceType: "module" });
  console.log("verify ok (acorn)");
}

function install() {
  const packed = path.join(ROOT, "out", "app-chat-local-handoff-v34.asar");
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
    fs.copyFileSync(dest, `${dest}.bak-pre-v34-${Date.now()}`);
    fs.copyFileSync(packed, dest);
    console.log("installed", dest);
  }
}

killCodex();
apply();
verify();
if (process.argv.includes("--check")) process.exit(0);
install();
console.log("done — run scripts/_resign-live-runtime.js next");
