#!/usr/bin/env node
"use strict";
/**
 * Find existing-thread send path: who awaits oD/Nl and reads .turn
 */
const fs = require("fs");
const path = require("path");
const ASSETS = path.join(__dirname, "..", "src/mac-x64/_asar/webview/assets");

const send = fs.readFileSync(
  path.join(ASSETS, fs.readdirSync(ASSETS).find((f) => f.includes("oxnpxkxc") && f.endsWith(".js"))),
  "utf8",
);

// Find export alias for oD
const exp = send.indexOf("oD as ");
console.log("oD as export", send.slice(exp, exp + 40));
// Also Nl=
const nl = send.indexOf("Nl=oD") >= 0 ? "Nl=oD" : send.includes("oD as Nl") ? "oD as Nl" : "?";
console.log("Nl alias?", nl, send.includes("Nl=oD"), send.includes("oD as Nl"));

// Search for .turn after await patterns involving send
const re = /(?:await\s+\w+\([^)]{0,120}\))(?:\s*\?\.)?\.turn/g;
let m;
let n = 0;
console.log("\n==== await X(...).turn sites in send ====");
while ((m = re.exec(send)) && n < 20) {
  console.log("---", n, "---");
  console.log(send.slice(Math.max(0, m.index - 60), m.index + 200));
  n++;
}

// Find sendUserMessage / sendFollowUp / turn start wrappers
for (const needle of [
  "async sendUserMessage",
  "sendFollowUp",
  "async steer(",
  "async sendMessage",
  "startTurn",
  "function qD",
  "function nD",
  "function aD",
  "function sD",
]) {
  const i = send.indexOf(needle);
  console.log("\n", needle, i);
  if (i >= 0) console.log(send.slice(i, i + 350));
}

// Who calls oD besides startConversation
let i = 0;
n = 0;
console.log("\n==== all await oD ====");
while ((i = send.indexOf("await oD(", i)) >= 0 && n < 15) {
  console.log("\n@", i);
  console.log(send.slice(Math.max(0, i - 150), i + 350));
  i += 9;
  n++;
}
