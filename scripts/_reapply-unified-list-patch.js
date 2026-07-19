#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const file = path.join(__dirname, "patch-dedicated-chat-mode.js");
let s = fs.readFileSync(file, "utf8");

function rep(old, neu, label) {
  const n = s.split(old).length - 1;
  if (n !== 1) throw new Error(`${label}: expected 1, found ${n}`);
  s = s.replace(old, neu);
  console.log("ok", label);
}

rep(
  "let seed=CDRBuildCodexSeed(e,t),home=CDRMode===\\`chat\\`?\\`/chat?mode=chat\\`:\\`/\\`;r(home,{state:{prefillPrompt:seed,cdrContinueThreadKey:t,cdrAutoSubmit:!0}})",
  "let seed=CDRBuildCodexSeed(e,t);if(CDRMode===\\`chat\\`){try{localStorage.setItem(\\`cdr-product-mode\\`,\\`chat\\`);document.documentElement.setAttribute(\\`data-codex-product-mode\\`,\\`chat\\`)}catch{}}r(\\`/\\`,{state:{prefillPrompt:seed,cdrContinueThreadKey:t,cdrAutoSubmit:!0}})",
  "OPEN_THREAD home",
);

rep(
  "function NOe({showSearchNavItem:e,chatMode:t}){let n=Cn(),r=t?(0,XF.jsx)(Dw,{icon:OC,onClick:()=>{n(\\`${CHAT_HOME_ROUTE}\\`)},label:(0,XF.jsx)(c,{id:\\`sidebarElectron.newChat\\`,defaultMessage:\\`New chat\\`,description:\\`Starts a new ChatGPT chat from the sidebar\\`}),className:\\`group\\`}):(0,XF.jsx)(POe,{}),i=e?(0,XF.jsx)(yOe,{}):null;return(0,XF.jsxs)(PC,{children:[r,i]})}",
  "function NOe({showSearchNavItem:e,chatMode:t}){let r=(0,XF.jsx)(POe,{}),i=e?(0,XF.jsx)(yOe,{}):null;return(0,XF.jsxs)(PC,{children:[r,i]})}",
  "NEW_CHAT_SOURCE",
);

rep(
  'function CDRChatHome(){try{localStorage.setItem(\\`cdr-product-mode\\`,\\`chat\\`)}catch{}let{accountId:e}=u_(),t=Yc(),[n,r]=(0,h0.useState)(e),i=n!==e;(0,h0.useLayoutEffect)(()=>{i&&(t.removeQueries({type:\\`inactive\\`}),void t.resetQueries({type:\\`active\\`}),r(e))},[e,i,t]);${SAFE_CHAT_HOME_GATE}return(0,g0.jsx)(h0.Suspense,{fallback:null,children:(0,g0.jsx)(T0,{chatMode:!0},"chat:"+(n??"anonymous"))})}',
  "function CDRChatHome(){try{localStorage.setItem(\\`cdr-product-mode\\`,\\`chat\\`);document.documentElement.setAttribute(\\`data-codex-product-mode\\`,\\`chat\\`)}catch{}return(0,g0.jsx)(Ni,{to:\\`/\\`,replace:!0})}",
  "CHAT_HOME_WRAPPER",
);

rep(
  'let CDRChatSidebarNode=CDRChatMode&&CDRChatAccountChanging?null:(0,iz.jsx)(IAe,{onScrolledContentUnderHeaderChange:k,scrollContainerRef:g,sidebarMode:CDRChatMode?`work`:`codex`,topContent:ee,chatMode:CDRChatMode},CDRChatMode?`chat:${CDRChatSettledAccount??`anonymous`}`:`codex`);",\n      "Chat history sidebar",',
  'let CDRChatSidebarNode=(0,iz.jsx)(IAe,{onScrolledContentUnderHeaderChange:k,scrollContainerRef:g,sidebarMode:`codex`,topContent:ee,chatMode:!1},`codex`);",\n      "Unified Codex sidebar across modes",',
  "sidebar node",
);

rep(
  'next = replaceExactly(next, ",R;if(m)R=[(0,yR.jsx)(eAe,{},`unified`)];", ",R;if(CDRChatMode)R=[(0,yR.jsx)(eAe,{chatMode:!0},`chat`)];else if(m)R=[(0,yR.jsx)(eAe,{},`unified`)];", "Chat unified history branch");',
  "// Keep unified Codex/CLI list in all modes — do not swap to ChatGPT history.",
  "no chatgpt eAe branch",
);

const oldJhe = [
  'next = replaceExactly(',
  '      next,',
  '      "T=(0,AL.useContext)(oC),E=Jhe({tppOnly:!0}),D=",',
  '      "T=(0,AL.useContext)(oC),CDRChatSource=Jhe({tppOnly:!CDRChatMode}),E=CDRChatMode?{...CDRChatSource,chatTargets:CDRChatSource.chatTargets.map(e=>({...e,route:`${e.route}?mode=chat`})),pinnedTargets:CDRChatSource.pinnedTargets.map(e=>({...e,route:`${e.route}?mode=chat`}))}:CDRChatSource,D=",',
  '      "non-TPP Chat history source",',
  '    );',
].join("\n");

rep(
  oldJhe,
  "// Intentionally keep Jhe({tppOnly:!0}) — same Codex CLI / local list in every mode.",
  "keep tppOnly",
);

rep(
  "if(CDRPath===`/`||CDRPath===``||CDRPath===`/chat`){CDRChatNavigate(`/chat?mode=chat`);return}",
  "if(CDRPath===`/`||CDRPath===``||CDRPath===`/chat`){CDRChatNavigate(`/`);return}",
  "mode select home",
);

fs.writeFileSync(file, s);
console.log("wrote", file);
