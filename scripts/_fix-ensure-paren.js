#!/usr/bin/env node
"use strict";
const fs = require("fs");
const p = "scripts/_apply-sticky-chat-v45.js";
let s = fs.readFileSync(p, "utf8");
const bad = ':ensure-client */)}));"';
const good = ':ensure-client */)}));"';
// Wait - need to be careful. bad has ) after */
// bad chars after */: ) } ) ) ;
// good chars after */: } ) ) ;

const needle = ":ensure-client */";
const i = s.indexOf(needle);
if (i < 0) throw new Error("needle missing");
const after = s.slice(i + needle.length, i + needle.length + 5);
console.log("current after", JSON.stringify(after), [...after].map((c) => c));
if (after[0] !== ")") throw new Error("expected extra paren, got " + JSON.stringify(after));
// remove the first )
s = s.slice(0, i + needle.length) + after.slice(1) + s.slice(i + needle.length + after.length);
// actually after is 5 chars `)}));` - we only want to remove first paren from the ending sequence
// Better: find exact and replace
const from = ':ensure-client */)}));"';
const to = ':ensure-client */)}));"';
console.log("from===to?", from === to);
console.log("from", JSON.stringify(from));
console.log("to  ", JSON.stringify(to));
