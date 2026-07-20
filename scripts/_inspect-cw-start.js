#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p =
  "src/mac-x64/_asar/webview/assets/local-conversation-thread-Bnxyo76e.js";
const s = fs.readFileSync(p, "utf8");
const start = s.indexOf(
  "function Cw({conversationId:e,enableMcpApps:t,isReadOnly:n,initialScrollOffset:a,initialVirtualizedTurnListRestoreState:s,isResuming:c,isBackgroundSubagentsEnabled:l,consumePendingLatestTurnSubmitPlac",
);
// find opening brace of function
let brace = s.indexOf("{", start);
console.log(s.slice(start, brace + 200));
