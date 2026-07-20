#!/usr/bin/env node
"use strict";
/**
 * Reproduce Fa/Ia/ao path with synthetic extras turns — see what throws.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const turnsPath = path.join(
  __dirname,
  "../src/mac-x64/_asar/webview/assets/app-initial~app-main~settings-command-menu-section-items~new-thread-panel-page~settings-pag~bzu8y8ld-CrC1XERG.js",
);
const src = fs.readFileSync(turnsPath, "utf8");

// Extract Fa + Ia + La + za helpers by evaluating a minimal slice is hard (imports).
// Instead: manually run the Ia + loop logic equivalent.

function Ia(e) {
  return e.map((e, t) => {
    let n = e.turnId;
    return { physicalTurnIds: n == null ? [] : [n], turn: e, turnId: n, turnIndex: t };
  });
}

const extras = [
  { role: "user", text: "hi", ts: Date.now(), source: "chat" },
  { role: "assistant", text: "hello", ts: Date.now() + 1, source: "chat" },
];

const mapped = extras
  .map((x, i) => {
    if (!x || typeof x !== "object") return null;
    let isUser = x.role === "user";
    let item = isUser
      ? {
          id: "cdr-extra-item-" + i,
          type: "userMessage",
          content: [{ type: "text", text: String(x.text || ""), text_elements: [] }],
        }
      : { id: "cdr-extra-item-" + i, type: "agentMessage", text: String(x.text || "") };
    let id = "cdr-extra-" + i + "-" + (x.ts || i);
    return {
      id,
      turnId: id,
      status: "completed",
      turnStartedAtMs: x.ts || Date.now(),
      items: [item],
      cdrSource: x.source || "chat",
    };
  })
  .filter((e) => e && Array.isArray(e.items));

console.log("mapped", JSON.stringify(mapped, null, 2));
const b = Ia(mapped);
console.log("Ia ok", b.length);
for (const e of b) {
  const { turn: n } = e;
  console.log("entry turnId", e.turnId, "items", n.items?.length, "has turn", !!n);
}

// Simulate the dangerous filter from no():
try {
  const r = { visibleTurnEntries: b };
  const i = r.visibleTurnEntries.filter(({ turn: e }) =>
    e.items.some((e) => e.type === "imageGeneration" && e.src != null),
  );
  console.log("image filter ok", i.length);
} catch (err) {
  console.error("image filter FAIL", err.message);
}

// Simulate ao map
try {
  const i = b;
  const out = i.map(({ preserveServerUserMessages: e, requests: n, turn: r }) => ({
    e,
    n,
    hasTurn: !!r,
  }));
  console.log("ao map ok", out);
} catch (err) {
  console.error("ao map FAIL", err.message);
}

// What if visibleTurnEntries has a gap-shaped entry mixed in (old bug)?
try {
  const bad = [...b, undefined, { type: "gap", turnKey: "x" }];
  bad.filter(({ turn: e }) => e && e.items);
} catch (err) {
  console.error("EXPECTED crash on undefined:", err.message);
}

// Berry za path — extract za function text
const zaAt = src.indexOf("function za(");
console.log("\nza:\n", src.slice(zaAt, zaAt + 800));
