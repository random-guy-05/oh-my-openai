#!/usr/bin/env node
"use strict";
const fs = require("fs");
const page = fs.readFileSync(
  "src/mac-x64/_asar/webview/assets/app-initial~app-main~appgen-settings-page~page~appgen-library-page~appgen-page~appgen-setti~ogh9jurw-Ccxu2qV_.js",
  "utf8",
);
console.log("Xr count", page.split("Xr").length - 1);
console.log("Xr(", page.indexOf("Xr("));
console.log("as Xr", page.indexOf("as Xr"));

// Mode controller - what hooks/imports are available in nearby init
const mc = page.indexOf("function QJ(");
console.log("\nQJ", page.slice(mc, mc + 200));
const init = page.indexOf("nY=e((()=>{$J=U()");
console.log("\ninit", page.slice(init, init + 400));

// Check if Qp and am are available in same scope as QJ
console.log("Qp in page", page.includes("Qp()"));
console.log("am(`/local", page.includes("am(`/local"));
