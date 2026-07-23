"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const assets = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const LOCAL = path.join(assets, "local-conversation-thread-Bnxyo76e.js");
const TURNS = path.join(
  assets,
  "app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
);

function markers(name, s) {
  console.log("====", name, "len", s.length);
  for (const m of [
    "sticky-chat-v48",
    "sticky-chat-v47",
    "sticky-chat-v46",
    "sticky-chat-v43",
    "extras-tick",
    "turns-merge",
    "gs-guard",
    "harden-",
    "cdr-thread-extras",
    "if(!Array.isArray(extras)||!extras.length)return base",
    "(e.turn||e.type===`gap`||e.turnKey!=null)",
    "filter(e=>!e||!e.cdrSource)",
  ]) {
    console.log(" ", m, s.split(m).length - 1);
  }
}

function extractExtras(s) {
  const markers = [
    "sticky-chat-v48:extras-tick",
    "sticky-chat-v47:extras-tick",
    "sticky-chat-v46:extras-tick",
    "sticky-chat-v43:extras-tick",
  ];
  let idx = -1;
  let which = null;
  for (const m of markers) {
    idx = s.indexOf(m);
    if (idx >= 0) {
      which = m;
      break;
    }
  }
  if (idx < 0) {
    console.log("NO extras-tick");
    return;
  }
  const start = s.lastIndexOf("(()=>{", idx);
  const end = s.indexOf("})(),V=B.at(-1)", idx);
  console.log("EXTRAS", which, "start", start, "end", end, "len", end - start);
  console.log(s.slice(start, end > 0 ? end + 4 : start + 1500));
}

function extractTurnsMerge(s) {
  const idx = s.indexOf("cdr-thread-extras:`+key");
  if (idx < 0) {
    console.log("NO turns-merge");
    return;
  }
  const start = Math.max(0, s.lastIndexOf("(()=>{", idx));
  const ret = s.indexOf("return", idx);
  const end = s.indexOf("})()", ret);
  console.log("TURNS-MERGE snippet:");
  console.log(s.slice(start, Math.min(end + 4, start + 2000)));
}

function findUnsafe(name, s) {
  console.log("==== unsafe destructures", name);
  const patterns = [
    /\.map\(\(\{turn[^}]*\}\)/g,
    /\.filter\(\(\{turn[^}]*\}\)/g,
    /\.find\(\(\{turn[^}]*\}\)/g,
    /\.flatMap\(\(\{turn[^}]*\}\)/g,
    /\.map\(\(\{[^}]{0,100}turn:[^}]{0,60}\}\)/g,
    /\.filter\(\(\{[^}]{0,100}turn:[^}]{0,60}\}\)/g,
    /\.find\(\(\{[^}]{0,100}turn:[^}]{0,60}\}\)/g,
  ];
  const seen = new Set();
  for (const re of patterns) {
    let m;
    while ((m = re.exec(s))) {
      const snip = s.slice(Math.max(0, m.index - 50), m.index + 140);
      if (seen.has(snip)) continue;
      seen.add(snip);
      console.log(m.index, JSON.stringify(snip));
    }
  }

  // also bare .turn reads after optional-less access on array elems
  console.log("==== r.turn / entry.turn without guard nearby", name);
  const re2 = /\b([a-zA-Z_$][\w$]*)\.turn\b/g;
  let m2;
  let shown = 0;
  while ((m2 = re2.exec(s)) && shown < 40) {
    const varn = m2[1];
    if (["e", "r", "n", "t", "o", "a", "i", "s", "u", "c", "d", "l", "x", "y", "z", "B", "V"].indexOf(varn) < 0)
      continue;
    const before = s.slice(Math.max(0, m2.index - 80), m2.index);
    if (/&&\s*$|\?\./.test(before) || before.includes("!r||!r.turn") || before.includes("e&&e.turn"))
      continue;
    // look for for-loop / map context
    const ctx = s.slice(Math.max(0, m2.index - 100), m2.index + 60);
    if (!/\.map|\.filter|\.find|for\s*\(|for\(/.test(ctx) && !/entries|Turns|visible/.test(ctx))
      continue;
    console.log(m2.index, JSON.stringify(ctx));
    shown++;
  }
}

const local = fs.readFileSync(LOCAL, "utf8");
const turns = fs.readFileSync(TURNS, "utf8");
markers("local", local);
extractExtras(local);
findUnsafe("local", local);
markers("turns", turns);
extractTurnsMerge(turns);
findUnsafe("turns", turns);
