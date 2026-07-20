#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js",
  "utf8",
);
const a =
  "){let _=r(Ai),v=Pi(),y=Qc(),b=(0,Tw.useRef)(null),x=Kc(),S=i(sr,e),C=i(Qr,e);i(Zn,e),i(nr,null);";
console.log("count", s.split(a).length - 1);

const rhs =
  "{firstVisibleTurnStartedAtMs:N,generatedImageTurnEntries:P,hasInheritedParentTurns:F,hasRenderableTurns:I,hasUserMessage:L,latestVisibleTurnId:R,renderEntries:z,visibleTurnEntries:B}=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l})";
console.log("rhs count", s.split(rhs).length - 1);
// after repair it should be 1; currently broken so 0
console.log(
  "has original rhs",
  s.includes(
    "=i(ll,{conversationId:e,isBackgroundSubagentsEnabled:l}),V=B.at(-1)",
  ),
);
