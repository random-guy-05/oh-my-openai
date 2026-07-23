"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");

// Chat mode send/create bridge path
const files = fs.readdirSync(assets).filter((f) => f.endsWith(".js"));
for (const f of files) {
  const p = path.join(assets, f);
  if (fs.statSync(p).size > 15e6) continue;
  const s = fs.readFileSync(p, "utf8");
  if (!s.includes("CDRStickyChatSend") && !s.includes("cdr-bridge") && !s.includes("sticky-chat"))
    continue;
  if (!/CDRSticky|cdr-bridge|sticky-chat-v/.test(s)) continue;

  console.log("\n====", f.slice(0, 90));
  for (const n of [
    "CDRStickyChatSend",
    "cdr-bridge",
    "sticky-chat-v43",
    "sticky-chat-v44",
    "sticky-chat-v48",
    "mode!==`chat`",
    "mode===`chat`",
    "cdr-product-mode",
  ]) {
    const c = s.split(n).length - 1;
    if (c) console.log(" ", n, c);
  }

  // Extract bridge function head
  for (const marker of ["CDRStickyChatSend", "cdr-bridge-v36", "/* cdr-bridge", ":bridge-fn"]) {
    const i = s.indexOf(marker);
    if (i < 0) continue;
    console.log("SNIP", marker, JSON.stringify(s.slice(Math.max(0, i - 80), i + 400)));
  }
}

// Also look for who throws into Fo path when creating local thread
const kg =
  "app-initial~avatarOverlayCompositionSurface~app-main~new-thread-panel-page~onboarding-page~~kgjrczv7-1dj9DXyF.js";
const s = fs.readFileSync(path.join(assets, kg), "utf8");
const disp = s.indexOf("t===`cloud`?Io(e,n):Fo(e,n)");
// walk back to get full formatter function
const fnStart = s.lastIndexOf("function ", disp);
console.log("\n==== FULL formatter fn");
console.log(s.slice(fnStart, disp + 40));

// Search create conversation catch that uses this
for (const n of ["startTask", "createTask", "createConversation", "startConversation", "onError", "showToast"]) {
  console.log(n, s.split(n).length - 1);
}
