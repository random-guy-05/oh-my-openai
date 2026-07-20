#!/usr/bin/env node
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SETTINGS = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~unq8yzli-BVneZysG.js",
);
const CHAT = path.join(
  ROOT,
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
);

const settings = fs.readFileSync(SETTINGS, "utf8");
const chat = fs.readFileSync(CHAT, "utf8");

// Find te= assignment and walk back to find Cg/Ug binding via import aliases at end of file or nearby
const te = settings.indexOf("te=CDRRuntime.mode()===`chat`?Ug(y):Cg(y,l)");
console.log("te at", te);
console.log(settings.slice(te - 500, te + 800));

// Search for ",Cg=" or " Cg=" or "Cg=" near functions that mention sol/terra or filter models
const needles = ["Cg=", "Ug=", "function Cg", "function Ug", ",Cg,", " Cg,", "as Cg", "as Ug"];
for (const n of needles) {
  let i = 0,
    c = 0;
  while (c < 8) {
    i = settings.indexOf(n, i);
    if (i < 0) break;
    const snip = settings.slice(Math.max(0, i - 40), i + 120);
    if (/model|reason|sol|terra|effort|picker|display|power|flatten/i.test(snip) || true) {
      console.log("N", n, i, snip.replace(/\n/g, " ").slice(0, 180));
    }
    i += n.length;
    c++;
  }
}

// Find Ob( and Ab( near te
const ob = settings.lastIndexOf("Ob=", te);
const ab = settings.lastIndexOf("Ab=", te);
console.log("\nOb= last before te", ob, settings.slice(ob, ob + 300));
console.log("\nAb= last before te", ab, settings.slice(ab, ab + 300));

// Broader: find helpers that take models array and return filtered
for (const re of [
  /function [A-Za-z]{1,3}\(e,t\)\{[^}]{0,80}sol/i,
  /[A-Za-z]{1,3}=[A-Za-z]{0,3}\(\(e,t\)=>/,
]) {
  // skip complex
}

// Look for "gpt-5.4" or "instant" in settings/chat for expected chat labels
for (const pat of ["instant", "Instant", "o3", "gpt-5.5", "max", "thinking_effort"]) {
  console.log(pat, "settings", settings.split(pat).length - 1, "chat", chat.split(pat).length - 1);
}

// Extract ChatGPT models transform function - search for default_model_slug mapping
const dm = chat.indexOf("default_model_slug");
console.log("\n=== default_model_slug contexts ===");
let i = 0;
let c = 0;
while (c < 5) {
  i = chat.indexOf("default_model_slug", i);
  if (i < 0) break;
  console.log("---", c, i);
  console.log(chat.slice(Math.max(0, i - 600), i + 400));
  i += 20;
  c++;
}

// Find options push / title mapping
const titleIdx = chat.indexOf("selectedLabel");
console.log("\n=== selectedLabel first ===");
console.log(chat.slice(Math.max(0, titleIdx - 800), titleIdx + 600));
