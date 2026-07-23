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

const local = fs.readFileSync(LOCAL, "utf8");
const turns = fs.readFileSync(TURNS, "utf8");

function dumpAround(label, s, needle, pad) {
  let i = 0;
  let c = 0;
  console.log("====", label, needle);
  while ((i = s.indexOf(needle, i)) >= 0 && c < 12) {
    console.log("@", i, JSON.stringify(s.slice(Math.max(0, i - pad), i + needle.length + pad)));
    i += needle.length;
    c++;
  }
}

// Critical remaining unsafe sites
dumpAround("local D.map", local, "D.map(e=>e.turn)", 120);
dumpAround("local flatMap e.turn", local, "flatMap(e=>{let a=NC.get(e.turn)", 150);
dumpAround("local RC(", local, "RC(D.map", 200);

dumpAround("turns second za", turns, "a=n.map(({turn:e})=>e)", 150);
dumpAround("turns za all", turns, ".map(({turn:e})=>e)", 100);
dumpAround("turns harden image", turns, "harden-turn-map", 200);
dumpAround("turns harden ao", turns, "harden-ao-map", 200);

// Any remaining unhardened {turn} destructure without prior filter
console.log("\n==== remaining unhardened {turn} in turns");
const re = /\.(map|filter|find|flatMap)\(\(\{([^}]*)turn:([^}]*)\}\)/g;
let m;
while ((m = re.exec(turns))) {
  const before = turns.slice(Math.max(0, m.index - 60), m.index);
  const hardened = /filter\(e=>e&&e\.turn\)/.test(before);
  console.log(
    (hardened ? "OK " : "BAD"),
    m.index,
    JSON.stringify(before.slice(-40) + m[0].slice(0, 80)),
  );
}

console.log("\n==== remaining unhardened {turn} in local");
const re2 = /\.(map|filter|find|flatMap)\(\(\{([^}]*)turn:([^}]*)\}\)/g;
while ((m = re2.exec(local))) {
  const before = local.slice(Math.max(0, m.index - 80), m.index);
  const hardened = /filter\([^)]*e\.turn|n&&n\.turn/.test(before);
  console.log(
    (hardened ? "OK " : "BAD"),
    m.index,
    JSON.stringify(before.slice(-50) + m[0].slice(0, 90)),
  );
}

// Also .map(e=>e.turn) style
console.log("\n==== .map(e=>e.turn) style local");
const re3 = /\.map\(\(?e\)?\s*=>\s*e\.turn\)/g;
while ((m = re3.exec(local))) {
  console.log(m.index, JSON.stringify(local.slice(m.index - 60, m.index + 40)));
}
console.log("==== .map(e=>e.turn) style turns");
while ((m = re3.exec(turns))) {
  console.log(m.index, JSON.stringify(turns.slice(m.index - 60, m.index + 40)));
}
