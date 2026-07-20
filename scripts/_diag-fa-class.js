#!/usr/bin/env node
"use strict";
const fs = require("fs");
const chat = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  "utf8",
);
const i = chat.indexOf("fa=class{request=Di()");
console.log(chat.slice(i, i + 400));
console.log("\n--- L ---");
console.log(chat.slice(chat.indexOf("L=f(p,()=>new fa)"), chat.indexOf("L=f(p,()=>new fa)") + 80));

// Does fa have startCompletionStream?
const faStart = i;
const faStream = chat.indexOf("startCompletionStream", faStart);
console.log("\nstream in fa?", faStream > faStart && faStream < faStart + 20000, faStream);

// ea also has it - are they related?
console.log("ea stream", chat.indexOf("startCompletionStream", chat.indexOf("ea=class")));
console.log("publish-client at", chat.indexOf("sticky-chat-v43:publish-client"));
console.log(chat.slice(chat.indexOf("sticky-chat-v43:publish-client") - 80, chat.indexOf("sticky-chat-v43:publish-client") + 100));
