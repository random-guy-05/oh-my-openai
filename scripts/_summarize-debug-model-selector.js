#!/usr/bin/env node
"use strict";

const path = require("path");
const report = require(path.join(__dirname, "..", "out", "debug-model-selector-v55.json"));
console.log(JSON.stringify({
  modeSwitch: report.modeSwitch,
  modelFetch: report.modelFetch,
  candidate: report.candidate,
  selectionClick: report.selectionClick,
  after: {
    mode: report.after?.mode,
    href: report.after?.href,
    rows: report.after?.rows,
    selects: report.after?.selects,
    errors: report.after?.errors,
    overlays: report.after?.overlays,
    body: report.after?.body,
  },
}, null, 2));
