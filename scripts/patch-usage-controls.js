#!/usr/bin/env node
"use strict";

/**
 * Add per-thread token telemetry, prompt-cache visibility, and conservative
 * local usage caps to the native /status surface.
 *
 * The upstream server exposes exact token counters per thread, but rate-limit
 * percentages are account-wide. Five-hour and weekly thread percentages are
 * therefore tracked as observed deltas from a per-thread baseline. Concurrent
 * activity can make those deltas conservative; the UI labels them accordingly.
 */
const fs = require("fs");
const path = require("path");
const { SRC_DIR, relPath, parseBundleCached } = require("./patch-util");

// `parse` is the cached parser from patch-util.js — it memoises the AST
// per file path so the controller, dialog, verifier, and turn-guard
// patches on the same monolith share one Acorn pass per source string
// instead of each re-parsing the ~14 MB monolith. The error label it
// produces (`<relPath> failed to parse: <message>`) already matches
// what callers and tests expect from the original local `parse`.
const parse = parseBundleCached;

const MARKER = "codex-rebuild:usage-controls-v1";
const GUARD_MARKER = "codex-rebuild:usage-guard-v1";
const STORE_KEY = "cdr-usage-v1";

function installUsageRuntime() {
  if (globalThis.__cdrUsageV1) return globalThis.__cdrUsageV1;

  const storeKey = "cdr-usage-v1";
  const maxThreads = 128;
  const memorySignatures = new Map();
  const finite = (value) =>
    typeof value === "number" && Number.isFinite(value) ? value : null;
  const clampPercent = (value) => {
    const number = finite(Number(value));
    return number == null ? null : Math.max(0, Math.min(100, number));
  };
  const keyOf = (threadKey, threadId) => {
    const raw = String(threadKey || threadId || "").trim();
    return raw;
  };
  const emptyStore = () => ({ version: 1, threads: {}, aliases: {} });
  const load = () => {
    try {
      const value = JSON.parse(localStorage.getItem(storeKey) || "null");
      if (value && value.version === 1 && value.threads) {
        value.aliases = value.aliases && typeof value.aliases === "object" ? value.aliases : {};
        return value;
      }
    } catch {}
    return emptyStore();
  };
  const save = (store) => {
    try {
      const entries = Object.entries(store.threads).sort(
        (left, right) =>
          (right[1]?.updatedAt || 0) - (left[1]?.updatedAt || 0),
      );
      store.threads = Object.fromEntries(entries.slice(0, maxThreads));
      const retained = new Set(Object.keys(store.threads));
      store.aliases = Object.fromEntries(
        Object.entries(store.aliases || {}).filter(
          ([alias, target]) => retained.has(alias) || retained.has(target),
        ),
      );
      localStorage.setItem(storeKey, JSON.stringify(store));
    } catch {}
  };
  const resolveKey = (store, threadKey, threadId) => {
    const key = keyOf(threadKey, threadId);
    return store?.aliases?.[key] || key;
  };
  const notify = (threadKey, aliases = []) => {
    try {
      window.dispatchEvent(
        new CustomEvent("cdr-usage-change", {
          detail: { threadKey, aliases },
        }),
      );
    } catch {}
  };
  const tokenBucket = (bucket) => ({
    inputTokens: finite(bucket?.inputTokens) || 0,
    cachedInputTokens: finite(bucket?.cachedInputTokens) || 0,
    outputTokens: finite(bucket?.outputTokens) || 0,
    reasoningOutputTokens: finite(bucket?.reasoningOutputTokens) || 0,
    totalTokens: finite(bucket?.totalTokens) || 0,
  });
  const tokenUsage = (usage) => ({
    modelContextWindow: finite(usage?.modelContextWindow),
    total: tokenBucket(usage?.total),
    last: tokenBucket(usage?.last),
  });
  const coreWindow = (rows, targetMinutes) => {
    const candidates = (Array.isArray(rows) ? rows : [])
      .filter((row) => {
        const minutes = finite(row?.bucket?.windowDurationMins);
        return (
          minutes != null &&
          Math.abs(minutes - targetMinutes) <=
            Math.max(1, targetMinutes * 0.01) &&
          finite(row?.bucket?.usedPercent) != null
        );
      })
      .sort((left, right) => {
        const leftCore = left?.limitName == null ? 0 : 1;
        const rightCore = right?.limitName == null ? 0 : 1;
        return leftCore - rightCore;
      });
    const row = candidates[0];
    if (!row) return null;
    return {
      usedPercent: clampPercent(row.bucket.usedPercent),
      resetsAt: row.bucket.resetsAt ?? null,
    };
  };
  const windowDelta = (record, name) => {
    const current = record?.windows?.[name];
    const baseline = record?.baseline?.[name];
    if (!current || !baseline) return null;
    return Math.max(0, (current.usedPercent || 0) - (baseline.usedPercent || 0));
  };
  const observe = (threadKey, threadId, usage, rows) => {
    const key = keyOf(threadKey, threadId);
    if (!key) return;
    const nextUsage = tokenUsage(usage);
    const hasExactUsage =
      nextUsage.total.totalTokens > 0 || nextUsage.last.totalTokens > 0;
    const windows = {
      fiveHour: coreWindow(rows, 300),
      weekly: coreWindow(rows, 10080),
    };
    const signature = JSON.stringify([nextUsage, hasExactUsage, windows]);
    if (memorySignatures.get(key) === signature) return;
    memorySignatures.set(key, signature);
    while (memorySignatures.size > maxThreads) {
      memorySignatures.delete(memorySignatures.keys().next().value);
    }

    const store = load();
    const resolvedKey = resolveKey(store, key);
    const primaryKey = store.threads[resolvedKey] ? resolvedKey : key;
    const aliasKeys = [keyOf(threadKey), keyOf(threadId)].filter(Boolean);
    for (const alias of aliasKeys) {
      if (alias !== primaryKey) store.aliases[alias] = primaryKey;
    }
    const previous = store.threads[primaryKey] || {};
    const baseline = { ...(previous.baseline || {}) };
    for (const name of ["fiveHour", "weekly"]) {
      const current = windows[name];
      const priorBaseline = baseline[name];
      if (
        current &&
        (!priorBaseline ||
          (current.resetsAt != null &&
            priorBaseline.resetsAt != null &&
            current.resetsAt !== priorBaseline.resetsAt))
      ) {
        baseline[name] = { ...current };
      }
    }
    store.threads[primaryKey] = {
      updatedAt: Date.now(),
      config: previous.config || {
        fiveHourPercent: null,
        weeklyPercent: null,
        maxTokens: null,
      },
      baseline,
      windows,
      usage: nextUsage,
      hasExactUsage: hasExactUsage || previous.hasExactUsage === true,
    };
    save(store);
    notify(primaryKey, aliasKeys);
  };
  const getRecord = (threadKey, threadId) => {
    const store = load();
    return store.threads[resolveKey(store, threadKey, threadId)] || null;
  };
  const configure = (threadKey) => {
    const store = load();
    const key = resolveKey(store, threadKey);
    if (!key) return null;
    const record = store.threads[key] || {
      updatedAt: Date.now(),
      config: {},
      baseline: {},
      windows: {},
      usage: tokenUsage(null),
    };
    const askPercent = (label, current) => {
      const answer = window.prompt(
        `${label}\nBlank or 0 disables this cap.`,
        current == null ? "" : String(current),
      );
      if (answer == null) return current ?? null;
      if (!answer.trim() || Number(answer) === 0) return null;
      return clampPercent(answer);
    };
    const askTokens = (current) => {
      const answer = window.prompt(
        "Maximum cumulative tokens for this task\nBlank or 0 disables this cap.",
        current == null ? "" : String(current),
      );
      if (answer == null) return current ?? null;
      if (!answer.trim() || Number(answer) === 0) return null;
      const value = Number(answer);
      return Number.isFinite(value) && value > 0 ? Math.floor(value) : null;
    };
    record.config = {
      fiveHourPercent: askPercent(
        "Maximum observed 5-hour usage for this task (%)",
        record.config?.fiveHourPercent,
      ),
      weeklyPercent: askPercent(
        "Maximum observed weekly usage for this task (%)",
        record.config?.weeklyPercent,
      ),
      maxTokens: askTokens(record.config?.maxTokens),
    };
    record.baseline = {
      fiveHour:
        record.baseline?.fiveHour ??
        (record.windows?.fiveHour ? { ...record.windows.fiveHour } : null),
      weekly:
        record.baseline?.weekly ??
        (record.windows?.weekly ? { ...record.windows.weekly } : null),
    };
    record.updatedAt = Date.now();
    store.threads[key] = record;
    save(store);
    notify(key, [key]);
    window.alert(
      "Task limits saved. Quota caps use observed account-wide deltas and are conservative when other tasks run concurrently.",
    );
    return { ...record.config };
  };
  const summary = (threadKey, usage) => {
    const key = keyOf(threadKey);
    if (!key) return null;
    const record = getRecord(key);
    const normalized = tokenUsage(usage || record?.usage);
    const hasExactUsage =
      normalized.total.totalTokens > 0 ||
      normalized.last.totalTokens > 0 ||
      record?.hasExactUsage === true;
    const ratio = (bucket) =>
      bucket.inputTokens > 0
        ? (bucket.cachedInputTokens / bucket.inputTokens) * 100
        : null;
    return {
      usage: normalized,
      hasExactUsage,
      estimatedTranscriptTokens: null,
      totalCachePercent: ratio(normalized.total),
      lastCachePercent: ratio(normalized.last),
      fiveHourDelta: windowDelta(record, "fiveHour"),
      weeklyDelta: windowDelta(record, "weekly"),
      config: record?.config || {
        fiveHourPercent: null,
        weeklyPercent: null,
        maxTokens: null,
      },
    };
  };
  const assertCanStart = (threadKey) => {
    const record = getRecord(threadKey);
    if (!record) return;
    const config = record.config || {};
    const checks = [
      [
        "5-hour",
        windowDelta(record, "fiveHour"),
        finite(config.fiveHourPercent),
        "%",
      ],
      [
        "weekly",
        windowDelta(record, "weekly"),
        finite(config.weeklyPercent),
        "%",
      ],
      [
        "token",
        record.hasExactUsage === true
          ? finite(record.usage?.total?.totalTokens)
          : null,
        finite(config.maxTokens),
        " tokens",
      ],
    ];
    for (const [name, used, cap, suffix] of checks) {
      if (used != null && cap != null && used >= cap) {
        throw new Error(
          `Task ${name} usage cap reached (${used.toFixed(
            suffix === "%" ? 1 : 0,
          )}${suffix} / ${cap}${suffix}). Open /limits to change it.`,
        );
      }
    }
  };

  globalThis.__cdrUsageV1 = {
    observe,
    configure,
    summary,
    assertCanStart,
    getRecord,
    storeKey,
  };
  return globalThis.__cdrUsageV1;
}

function assertTaskLimitWithoutRuntime(threadKey) {
  try {
    const value = JSON.parse(localStorage.getItem("cdr-usage-v1") || "null");
    const rawKey = String(threadKey || "");
    const resolvedKey = value?.aliases?.[rawKey] || rawKey;
    const record = value?.threads?.[resolvedKey];
    if (!record) return;
    const delta = (name) => {
      const current = record.windows?.[name];
      const baseline = record.baseline?.[name];
      return current && baseline
        ? Math.max(
            0,
            Number(current.usedPercent || 0) -
              Number(baseline.usedPercent || 0),
          )
        : null;
    };
    const checks = [
      ["5-hour", delta("fiveHour"), record.config?.fiveHourPercent, "%"],
      ["weekly", delta("weekly"), record.config?.weeklyPercent, "%"],
      [
        "token",
        record.hasExactUsage === true
          ? record.usage?.total?.totalTokens
          : null,
        record.config?.maxTokens,
        " tokens",
      ],
    ];
    for (const [name, usedValue, capValue, suffix] of checks) {
      const used = Number(usedValue);
      const cap = Number(capValue);
      if (
        Number.isFinite(used) &&
        Number.isFinite(cap) &&
        cap > 0 &&
        used >= cap
      ) {
        throw new Error(
          `Task ${name} usage cap reached (${used.toFixed(
            suffix === "%" ? 1 : 0,
          )}${suffix} / ${cap}${suffix}). Open /limits to change it.`,
        );
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("usage cap reached")) {
      throw error;
    }
  }
}

const RUNTIME_SOURCE = `(${installUsageRuntime.toString()})()`;
const FALLBACK_GUARD_SOURCE = `(${assertTaskLimitWithoutRuntime.toString()})`;

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  visitor(node);
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const child of value) walk(child, visitor);
    } else if (value && typeof value.type === "string") {
      walk(value, visitor);
    }
  }
}

function functionText(source, node) {
  return source.slice(node.start, node.end);
}

function findFunctions(ast, source, needles) {
  const matches = [];
  walk(ast, (node) => {
    if (node.type !== "FunctionDeclaration") return;
    const text = functionText(source, node);
    if (needles.every((needle) => text.includes(needle))) matches.push(node);
  });
  return matches;
}

function propertyLocal(objectPattern, propertyName) {
  const property = objectPattern.properties.find(
    (item) =>
      item.type === "Property" &&
      ((item.key.type === "Identifier" && item.key.name === propertyName) ||
        item.key.value === propertyName),
  );
  return property?.value?.name || null;
}

function calledMemberName(callExpression) {
  if (callExpression?.type !== "CallExpression") return null;
  let callee = callExpression.callee;
  if (callee?.type === "SequenceExpression") {
    callee = callee.expressions.at(-1);
  }
  if (callee?.type !== "MemberExpression") return null;
  return callee.property?.name || callee.property?.value || null;
}

function insertions(source, edits) {
  let next = source;
  for (const edit of [...edits].sort((a, b) => b.at - a.at)) {
    next = next.slice(0, edit.at) + edit.text + next.slice(edit.at);
  }
  return next;
}

function patchStatusBundle(source, filePath) {
  if (source.includes(MARKER)) {
    verifyStatusBundle(source, filePath);
    return source;
  }

  const ast = parse(source, filePath);
  const contextFunctions = findFunctions(ast, source, [
    "modelContextWindow",
    "last.totalTokens",
    "remainingTokens",
  ]);
  const controllerFunctions = findFunctions(ast, source, [
    "composer.statusSlashCommand.description",
    "contextUsage",
    "rateLimitRows",
  ]);
  const dialogFunctions = findFunctions(ast, source, [
    "composer.statusPlain.sessionLabel",
    "composer.statusPlain.rateLimitFallbackLabel",
    "composer.statusPlain.contextValueMetadata",
  ]);
  if (
    contextFunctions.length !== 1 ||
    controllerFunctions.length !== 1 ||
    dialogFunctions.length !== 1
  ) {
    throw new Error(
      `${relPath(filePath)} status structure mismatch ` +
        `(context=${contextFunctions.length}, controller=${controllerFunctions.length}, dialog=${dialogFunctions.length})`,
    );
  }

  const contextName = contextFunctions[0].id.name;
  const controller = controllerFunctions[0];
  const dialog = dialogFunctions[0];

  let controllerProps = null;
  let openVariable = null;
  let usageVariable = null;
  let statusCallObject = null;
  let registryCall = null;
  walk(controller, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "ObjectPattern" &&
      propertyLocal(node.id, "conversationId") &&
      propertyLocal(node.id, "threadId")
    ) {
      controllerProps = node.id;
    }
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "ArrayPattern" &&
      node.id.elements.length >= 2 &&
      calledMemberName(node.init) === "useState"
    ) {
      openVariable = node.id.elements[0]?.name || openVariable;
    }
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.callee.name === contextName &&
      node.arguments[0]?.type === "Identifier"
    ) {
      usageVariable = node.arguments[0].name;
    }
    if (
      node.type === "CallExpression" &&
      node.arguments[1]?.type === "ObjectExpression"
    ) {
      const keys = new Set(
        node.arguments[1].properties
          .map((property) => property.key?.name || property.key?.value)
          .filter(Boolean),
      );
      if (
        ["threadId", "contextUsage", "rateLimitRows", "alertData", "onClose"].every(
          (key) => keys.has(key),
        )
      ) {
        statusCallObject = node.arguments[1];
      }
    }
  });

  const conversationVariable = controllerProps
    ? propertyLocal(controllerProps, "conversationId")
    : null;
  const threadIdVariable = controllerProps
    ? propertyLocal(controllerProps, "threadId")
    : null;
  const rateRowsProperty = statusCallObject?.properties.find(
    (property) =>
      (property.key?.name || property.key?.value) === "rateLimitRows",
  );
  const rateRowsVariable = rateRowsProperty?.value?.name || null;
  if (
    !conversationVariable ||
    !threadIdVariable ||
    !openVariable ||
    !usageVariable ||
    !rateRowsVariable ||
    !statusCallObject
  ) {
    throw new Error(`${relPath(filePath)} could not resolve status variables`);
  }

  walk(controller, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "Identifier" &&
      node.arguments[0]?.type === "Identifier" &&
      node.arguments[0].name !== conversationVariable
    ) {
      const callEnd = source.slice(node.end, node.end + 40);
      if (callEnd.startsWith(`,!${openVariable})return null`)) {
        registryCall = {
          functionName: node.callee.name,
          statusObject: node.arguments[0].name,
          insertAt: node.end,
        };
      }
    }
  });
  if (!registryCall) {
    throw new Error(`${relPath(filePath)} could not resolve slash-command registry`);
  }

  const controllerSource = functionText(source, controller);
  const controllerEdits = [
    {
      at: statusCallObject.end - controller.start - 1,
      text: `,usageDetails:${usageVariable},threadKey:${conversationVariable}`,
    },
    {
      at: registryCall.insertAt - controller.start,
      text:
        `,/* ${MARKER} */${RUNTIME_SOURCE},` +
        `(()=>{try{globalThis.__cdrUsageV1.observe(${conversationVariable},${threadIdVariable},${usageVariable},${rateRowsVariable})}catch{}})(),` +
        `${registryCall.functionName}({...${registryCall.statusObject},id:\`limits\`,title:\`Task limits\`,` +
        `description:\`Set token, 5-hour, and weekly caps for this task\`,` +
        `onSelect:async()=>{globalThis.__cdrUsageV1.configure(${conversationVariable})}})`,
    },
  ];
  const patchedController = insertions(controllerSource, controllerEdits);

  let dialogProps = null;
  let rowPushVariable = null;
  walk(dialog, (node) => {
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "ObjectPattern" &&
      propertyLocal(node.id, "threadId") &&
      propertyLocal(node.id, "contextUsage")
    ) {
      dialogProps = node.id;
    }
    if (
      node.type === "VariableDeclarator" &&
      node.id.type === "Identifier" &&
      node.init?.type === "ArrowFunctionExpression"
    ) {
      const text = functionText(source, node.init);
      if (text.includes(".push({key:") && text.includes("rateLimitValue")) {
        rowPushVariable = node.id.name;
      }
    }
  });
  if (!dialogProps || !rowPushVariable) {
    throw new Error(`${relPath(filePath)} could not resolve status dialog variables`);
  }

  const dialogSource = functionText(source, dialog);
  const rateLabelIndex = dialogSource.indexOf(
    "composer.statusPlain.rateLimitFallbackLabel",
  );
  const rateDeclarationIndex = dialogSource.lastIndexOf("let ", rateLabelIndex);
  if (rateLabelIndex < 0 || rateDeclarationIndex < 0) {
    throw new Error(`${relPath(filePath)} could not locate status row insertion`);
  }
  const summaryRows =
    `try{let CDRSummary=globalThis.__cdrUsageV1?.summary(CDRThreadKey,CDRUsageDetails);` +
    `if(CDRSummary){let CDRFmt=e=>Number(e||0).toLocaleString(),CDRPct=e=>e==null?\`n/a\`:\`\${e.toFixed(1)}%\`,` +
    `CDRDelta=e=>e==null?\`n/a\`:\`+\${e.toFixed(1)}%\`,CDRLimit=(e,s)=>e==null?\`off\`:\`\${e}\${s}\`,` +
    `CDRTotal=CDRSummary.usage.total,CDRLast=CDRSummary.usage.last,CDRCfg=CDRSummary.config;` +
    `if(CDRSummary.hasExactUsage){` +
    `${rowPushVariable}(\`Task tokens:\`,\`input \${CDRFmt(CDRTotal.inputTokens)} · cached \${CDRFmt(CDRTotal.cachedInputTokens)} · output \${CDRFmt(CDRTotal.outputTokens)} · reasoning \${CDRFmt(CDRTotal.reasoningOutputTokens)} · total \${CDRFmt(CDRTotal.totalTokens)}\`);` +
    `${rowPushVariable}(\`Cache hit:\`,\`total \${CDRPct(CDRSummary.totalCachePercent)} · last \${CDRPct(CDRSummary.lastCachePercent)}\`);` +
    `${rowPushVariable}(\`Cache savings:\`,\`\${CDRFmt(CDRTotal.cachedInputTokens)} input tokens reused\`);` +
    `${rowPushVariable}(\`Last turn:\`,\`input \${CDRFmt(CDRLast.inputTokens)} · cached \${CDRFmt(CDRLast.cachedInputTokens)} · output \${CDRFmt(CDRLast.outputTokens)} · reasoning \${CDRFmt(CDRLast.reasoningOutputTokens)} · total \${CDRFmt(CDRLast.totalTokens)}\`)}else{` +
    `${rowPushVariable}(\`Task tokens:\`,\`exact counters pending for this local task\`);` +
    `${rowPushVariable}(\`Cache hit:\`,\`waiting for AppServer token telemetry\`)};` +
    `${rowPushVariable}(\`Observed quota:\`,\`5h \${CDRDelta(CDRSummary.fiveHourDelta)} · weekly \${CDRDelta(CDRSummary.weeklyDelta)}\`);` +
    `${rowPushVariable}(\`Task limits:\`,\`5h \${CDRLimit(CDRCfg.fiveHourPercent,\`%\`)} · weekly \${CDRLimit(CDRCfg.weeklyPercent,\`%\`)} · tokens \${CDRLimit(CDRCfg.maxTokens,\`\`)}\`)}}catch{}`;
  const dialogEdits = [
    {
      at: dialogProps.end - dialog.start - 1,
      text: ",usageDetails:CDRUsageDetails,threadKey:CDRThreadKey",
    },
    { at: rateDeclarationIndex, text: summaryRows },
  ];
  const patchedDialog = insertions(dialogSource, dialogEdits);

  let next = source;
  for (const replacement of [
    { node: controller, text: patchedController },
    { node: dialog, text: patchedDialog },
  ].sort((left, right) => right.node.start - left.node.start)) {
    next =
      next.slice(0, replacement.node.start) +
      replacement.text +
      next.slice(replacement.node.end);
  }
  verifyStatusBundle(next, filePath);
  return next;
}

function patchTurnGuard(source, filePath) {
  if (source.includes(GUARD_MARKER)) {
    verifyTurnGuard(source, filePath);
    return source;
  }
  const ast = parse(source, filePath);
  const functions = findFunctions(ast, source, [
    "turn/start",
    "beforeSendRequest",
    "useAppServerPermissionDefault",
  ]).filter((node) => functionText(source, node).length < 30000);
  if (functions.length !== 1) {
    throw new Error(
      `${relPath(filePath)} expected one turn-start function, found ${functions.length}`,
    );
  }
  const node = functions[0];
  const threadVariable = node.params[1]?.name;
  if (!threadVariable) {
    throw new Error(`${relPath(filePath)} turn-start thread parameter missing`);
  }
  const guard =
    `/* ${GUARD_MARKER} */` +
    `(globalThis.__cdrUsageV1?.assertCanStart||${FALLBACK_GUARD_SOURCE})(${threadVariable});`;
  const next =
    source.slice(0, node.body.start + 1) +
    guard +
    source.slice(node.body.start + 1);
  verifyTurnGuard(next, filePath);
  return next;
}

function verifyStatusBundle(source, filePath) {
  for (const needle of [
    MARKER,
    "cdr-usage-v1",
    "usageDetails:",
    "threadKey:",
    "Task tokens:",
    "Cache hit:",
    "Cache savings:",
    "reasoning",
    "exact counters pending for this local task",
    "Observed quota:",
    "id:`limits`",
  ]) {
    if (!source.includes(needle)) {
      throw new Error(`${relPath(filePath)} missing ${needle}`);
    }
  }
  parse(source, filePath);
}

function verifyTurnGuard(source, filePath) {
  if (!source.includes(GUARD_MARKER) || !source.includes("usage cap reached")) {
    throw new Error(`${relPath(filePath)} usage guard verification failed`);
  }
  parse(source, filePath);
}

function platformAssets(platform) {
  return path.join(SRC_DIR, platform, "_asar", "webview", "assets");
}

function locateTargets(platform) {
  const assets = platformAssets(platform);
  if (!fs.existsSync(assets)) {
    throw new Error(`${platform}: extracted webview assets are missing`);
  }
  const jsFiles = fs
    .readdirSync(assets)
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(assets, name));
  const status = jsFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return (
      source.includes("composer.statusPlain.contextValueMetadata") &&
      source.includes("composer.statusSlashCommand.description") &&
      source.includes("modelContextWindow") &&
      source.includes("rateLimitRows") &&
      source.includes("contextUsage")
    );
  });
  if (status.length !== 1) {
    throw new Error(`${platform}: expected one status bundle, found ${status.length}`);
  }
  // 26.721+: the status and turn/token bundles may be consolidated into a
  // single monolith.  Try the imported-set first; if that yields nothing,
  // fall back to searching all JS files (including the status bundle itself).
  const turn = jsFiles.filter((filePath) => {
    const source = fs.readFileSync(filePath, "utf8");
    return (
      source.includes("thread/tokenUsage/updated") &&
      source.includes("turn/start") &&
      source.includes("useAppServerPermissionDefault")
    );
  });
  if (turn.length === 0) {
    throw new Error(
      `${platform}: expected one turn/token bundle, found 0`,
    );
  }
  // Prefer a bundle that is NOT the status bundle (keeps the old behaviour
  // when they are still split).  If only the status bundle matches, use it.
  const turnFile = turn.find((f) => f !== status[0]) || turn[0];
  return { status: status[0], turn: turnFile };
}

function main() {
  const args = process.argv.slice(2);
  const checkOnly = args.includes("--check");
  const platform =
    args.find((arg) => ["mac-x64", "mac-arm64", "win"].includes(arg)) ||
    "mac-x64";
  const targets = locateTargets(platform);
  const statusSource = fs.readFileSync(targets.status, "utf8");
  const turnSource = fs.readFileSync(targets.turn, "utf8");
  const patchedStatus = patchStatusBundle(statusSource, targets.status);
  const patchedTurn = patchTurnGuard(turnSource, targets.turn);

  if (checkOnly) {
    // `--check` is the release gate documented in CUSTOM_BUILD.md, so it has
    // to assert "installed", not "could be installed". It previously printed
    // `[ok] … patchable` and exited 0 for a tree where the status panel was
    // entirely absent, which is how 26.721 shipped without the usage panel.
    const statusInstalled = patchedStatus === statusSource;
    const turnInstalled = patchedTurn === turnSource;
    if (statusInstalled && turnInstalled) {
      console.log(`  [ok] ${platform}: usage controls are installed`);
      return;
    }
    const missing = [
      !statusInstalled && `status bundle (${relPath(targets.status)})`,
      !turnInstalled && `turn guard (${relPath(targets.turn)})`,
    ].filter(Boolean);
    console.error(
      `  [x] ${platform}: usage controls are NOT installed — ${missing.join(", ")}`,
    );
    console.error("  [x] Run `node scripts/patch-all.js " + platform + "` before building.");
    process.exit(1);
  }
  if (patchedStatus !== statusSource) fs.writeFileSync(targets.status, patchedStatus);
  if (patchedTurn !== turnSource) fs.writeFileSync(targets.turn, patchedTurn);
  console.log(`  [ok] ${platform}: installed usage telemetry and task limits`);
}

module.exports = {
  installUsageRuntime,
  assertTaskLimitWithoutRuntime,
  patchStatusBundle,
  patchTurnGuard,
  locateTargets,
  verifyStatusBundle,
  verifyTurnGuard,
  STORE_KEY,
};

if (require.main === module) main();
