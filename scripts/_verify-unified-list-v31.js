"use strict";
const fs = require("fs");
const path = require("path");

const page = fs.readFileSync(
  path.join(
    __dirname,
    "../src/mac-x64/_asar/webview/assets/app-initial~app-main~page-ClBbNyfy.js",
  ),
  "utf8",
);

const checks = [
  ["sidebarMode:`codex`,topContent:ee,chatMode:!1", true],
  ["Jhe({tppOnly:!0})", true],
  ["function NOe({showSearchNavItem:e,chatMode:t}){let r=(0,XF.jsx)(POe,{})", true],
  ["CDRChatNavigate(`/`);return}", true],
  ["native-chat-mode-v31", true],
  [
    "function CDRChatHome(){try{localStorage.setItem(`cdr-product-mode`,`chat`);document.documentElement.setAttribute(`data-codex-product-mode`,`chat`)}catch{}return(0,g0.jsx)(Ni,{to:`/`,replace:!0})}",
    true,
  ],
  ["if(CDRChatMode)R=[(0,yR.jsx)(eAe,{chatMode:!0}", false],
  ["chatMode:CDRChatMode}", false],
];

let failed = 0;
for (const [needle, expectPresent] of checks) {
  const present = page.includes(needle);
  const ok = present === expectPresent;
  console.log(ok ? "OK" : "FAIL", expectPresent ? "need" : "forbid", needle.slice(0, 90));
  if (!ok) failed += 1;
}

const chatRouteCount = page.split("/chat?mode=chat").length - 1;
console.log("remaining /chat?mode=chat count:", chatRouteCount);
process.exit(failed ? 1 : 0);
