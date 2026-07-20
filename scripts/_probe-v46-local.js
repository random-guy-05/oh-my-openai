#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");

const p = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
);
const s = fs.readFileSync(p, "utf8");
const keys = [
  "sticky-chat-v43",
  "sticky-chat-v45",
  "sticky-chat-v46",
  "extras-tick",
  "extras-listen",
  "CDRExtrasTick",
  "cdr-thread-extras",
  "gs-guard",
  "function gS(",
  "visibleTurnEntries:B}=i(ll",
  "M=du(e),let[CDRExtrasTick",
  "){let _=r(Ai),v=Pi(),y=Qc()",
];
for (const k of keys) console.log(JSON.stringify(k), s.includes(k), s.indexOf(k));

let i = 0,
  n = 0;
while (n < 30) {
  i = s.indexOf("sticky-chat", i);
  if (i < 0) break;
  console.log("marker@", i, JSON.stringify(s.slice(i, i + 100)));
  i += 1;
  n += 1;
}

const rhs =
  "{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})";
console.log("rhsOld present", s.includes(rhs), s.indexOf(rhs));

const bodyAnchor =
  "){let _=r(Ai),v=Pi(),y=Qc(),b=(0,Tw.useRef)(null),x=Kc(),S=i(sr,e),C=i(Qr,e);i(Zn,e),i(nr,null);";
console.log("bodyAnchor present", s.includes(bodyAnchor), s.indexOf(bodyAnchor));

const gs =
  "function gS(e,t){for(let n=e.length-1;n>=0;--n){let r=e[n];if(!(r.turn.turnStartedAtMs!=null&&r.turn.turnStartedAtMs>t))return r.turn.status===`completed`?r.turnSearchKey:null}return null}";
console.log("gS unpatched", s.includes(gs), s.indexOf(gs));

// turns file
const turns = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
  ),
  "utf8",
);
for (const k of ["turns-merge", "sticky-chat-v43", "sticky-chat-v46", "cdr-thread-extras"]) {
  console.log("turns", k, turns.includes(k), turns.indexOf(k));
}

const send = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~notebook-preview-panel~app-main~business-checkout~oxnpxkxc-D1ceIDrn.js",
  ),
  "utf8",
);
for (const k of [
  "CDRStickyChatSend",
  "bridge-hook",
  "sticky-chat-v45:bridge-fn",
  "sticky-chat-v46:stream-clear",
]) {
  console.log("send", k, send.includes(k), send.indexOf(k));
}
