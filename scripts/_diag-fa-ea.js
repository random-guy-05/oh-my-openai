#!/usr/bin/env node
"use strict";
const fs = require("fs");
const chat = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~artifact-tab-content.electron~app-main~pull-request-code-review~new-thread-pane~nmo0zeut-Cn9CuVaZ.js",
  "utf8",
);

const L = chat.indexOf("L=f(p,()=>new fa)");
console.log("L atom", chat.slice(L - 100, L + 80));

// Find fa=
for (const p of ["fa=ea", "fa=class", "fa=ea", ",fa=", "fa=e", "var fa", "fa=new"]) {
  const i = chat.indexOf(p);
  console.log(p, i);
}

const fa = chat.indexOf("fa=");
console.log("\nall fa= nearby:");
let idx = 0,
  n = 0;
while ((idx = chat.indexOf("fa=", idx)) >= 0 && n < 15) {
  const ctx = chat.slice(idx, idx + 60);
  if (!/^[a-zA-Z]/.test(chat[idx - 1] || " ")) {
    console.log(idx, ctx);
    n++;
  }
  idx += 3;
}

// ea vs fa relationship
const ea = chat.indexOf("ea=class extends Ae");
console.log("\nea class", ea);
// After class ends, is there fa=ea?
const afterClass = chat.indexOf("startCompletionStream", ea);
// search fa=ea in file
console.log("fa=ea", chat.indexOf("fa=ea"));
console.log("fa=new ea", chat.indexOf("fa=new ea"));

// Look at export L
const exp = chat.slice(chat.lastIndexOf("export{"));
console.log("L export", exp.match(/[A-Za-z0-9_$]+ as L[,}]/));
console.log("fa export", exp.match(/fa as [A-Za-z0-9_$]+/));
console.log("ea export", exp.match(/ea as [A-Za-z0-9_$]+/));
