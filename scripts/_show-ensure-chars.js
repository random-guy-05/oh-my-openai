#!/usr/bin/env node
"use strict";
const fs = require("fs");
const s = fs.readFileSync("scripts/_apply-sticky-chat-v45.js", "utf8");
const i = s.indexOf(":ensure-client");
console.log(JSON.stringify(s.slice(i, i + 45)));
// show chars after */
const j = s.indexOf(":ensure-client */");
const after = s.slice(j + ":ensure-client */".length, j + ":ensure-client */".length + 10);
console.log(
  "after comment end:",
  JSON.stringify(after),
  [...after].map((c) => c.charCodeAt(0)),
);
