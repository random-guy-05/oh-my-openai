#!/usr/bin/env node
/**
 * Post-sync patch: expose only the current GPT-5.6 model family.
 *
 * The renderer sends every model-catalog request through the
 * "list-models-for-host" bridge handler. Patch that handler instead of
 * individual picker components so Codex, Work, automations, and dynamic tools
 * all observe the same filtered visible catalog while hidden internal models,
 * the server response shape, and pagination cursor remain intact.
 *
 * Also patch the new-turn model-settings resolver so a saved legacy model that
 * is no longer in the visible catalog falls back to the filtered default (Sol).
 * Thread-specific settings and historical thread rendering are left untouched.
 *
 * Usage:
 *   node scripts/patch-latest-models.js [mac-arm64|mac-x64|win|unix]
 *   node scripts/patch-latest-models.js --check
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { relPath, SRC_DIR } = require("./patch-util");

const MARKER = "codex-rebuild:latest-models";
const MODEL_SELECTION_MARKER = "codex-rebuild:coerce-latest-model";
const ALLOWED_MODELS = [
  "gpt-5.6-sol",
  "gpt-5.6-terra",
  "gpt-5.6-luna",
];
const ALL_PLATFORMS = ["mac-arm64", "mac-x64", "win"];

function walk(node, visitor) {
  if (!node || typeof node !== "object") return;
  if (node.type) visitor(node);

  for (const key of Object.keys(node)) {
    if (key === "type" || key === "start" || key === "end") continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item === "object" && item.type) walk(item, visitor);
      }
    } else if (child && typeof child === "object" && child.type) {
      walk(child, visitor);
    }
  }
}

function staticString(node) {
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  if (
    node?.type === "TemplateLiteral" &&
    node.expressions.length === 0 &&
    node.quasis.length === 1
  ) {
    return node.quasis[0].value.cooked;
  }
  if (node?.type === "Identifier") return node.name;
  return null;
}

function isTargetProperty(node) {
  return node.type === "Property" && staticString(node.key) === "list-models-for-host";
}

function isModelListRequest(node) {
  if (node.type !== "CallExpression") return false;
  if (node.callee?.type !== "MemberExpression") return false;
  if (staticString(node.callee.property) !== "sendRequest") return false;
  return staticString(node.arguments?.[0]) === "model/list";
}

function findTargetProperties(ast) {
  const properties = [];
  walk(ast, (node) => {
    if (isTargetProperty(node)) properties.push(node);
  });
  return properties;
}

function findModelListRequests(node) {
  const calls = [];
  walk(node, (child) => {
    if (isModelListRequest(child)) calls.push(child);
  });
  return calls;
}

function parseBundle(source, bundlePath) {
  try {
    return parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    throw new Error(`${relPath(bundlePath)} failed to parse: ${error.message}`);
  }
}

function modelAllowlistSource() {
  return JSON.stringify(ALLOWED_MODELS);
}

function isMemberOfIdentifier(node, objectName, propertyName) {
  return node?.type === "MemberExpression" &&
    node.object?.type === "Identifier" &&
    node.object.name === objectName &&
    staticString(node.property) === propertyName;
}

function isHiddenTrueComparison(node, parameterName) {
  if (node.type !== "BinaryExpression" || node.operator !== "===") return false;
  const pairs = [
    [node.left, node.right],
    [node.right, node.left],
  ];
  return pairs.some(([member, literal]) =>
    isMemberOfIdentifier(member, parameterName, "hidden") &&
    literal?.type === "Literal" &&
    literal.value === true,
  );
}

function callbackPreservesHidden(callback) {
  const parameter = callback.params?.[0];
  if (callback.params.length !== 1 || parameter?.type !== "Identifier") return false;
  let preservesHidden = false;
  walk(callback.body, (node) => {
    if (isHiddenTrueComparison(node, parameter.name)) preservesHidden = true;
  });
  return preservesHidden;
}

function isExactAllowedModelIncludes(node, parameterName) {
  if (node?.type !== "CallExpression" || node.arguments.length !== 1) return false;
  if (node.callee?.type !== "MemberExpression") return false;
  if (staticString(node.callee.property) !== "includes") return false;
  if (!isMemberOfIdentifier(node.arguments[0], parameterName, "model")) return false;

  const allowlist = node.callee.object;
  if (allowlist?.type !== "ArrayExpression") return false;
  const values = allowlist.elements.map(staticString);
  return values.length === ALLOWED_MODELS.length &&
    values.every((value, index) => value === ALLOWED_MODELS[index]);
}

function callbackHasExactAllowedFilterShape(callback) {
  const parameter = callback.params?.[0];
  if (callback.params.length !== 1 || parameter?.type !== "Identifier") return false;
  const body = callback.body;
  if (isExactAllowedModelIncludes(body, parameter.name)) return true;
  if (body?.type !== "LogicalExpression" || body.operator !== "||") return false;
  return (
    isHiddenTrueComparison(body.left, parameter.name) &&
    isExactAllowedModelIncludes(body.right, parameter.name)
  ) || (
    isHiddenTrueComparison(body.right, parameter.name) &&
    isExactAllowedModelIncludes(body.left, parameter.name)
  );
}

function findAllowedModelFilterCallbacks(node) {
  const callbacks = [];
  walk(node, (child) => {
    if (child.type !== "CallExpression") return;
    if (child.callee?.type !== "MemberExpression") return;
    if (staticString(child.callee.property) !== "filter") return;
    const callback = child.arguments?.[0];
    if (callback?.type !== "ArrowFunctionExpression") return;
    if (!callbackHasExactAllowedFilterShape(callback)) return;
    callbacks.push(callback);
  });
  return callbacks;
}

function collectBridgePatches(ast, source, bundlePath) {
  const properties = findTargetProperties(ast);
  if (properties.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} expected exactly one list-models-for-host handler, found ${properties.length}`,
    );
  }

  const property = properties[0];
  const propertySource = source.slice(property.start, property.end);
  const requests = findModelListRequests(property.value);
  if (requests.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} expected exactly one model/list request in the handler, found ${requests.length}`,
    );
  }

  if (propertySource.includes(MARKER)) {
    const callbacks = findAllowedModelFilterCallbacks(property.value);
    if (callbacks.length !== 1) {
      throw new Error(
        `${relPath(bundlePath)} expected one installed latest-model filter, found ${callbacks.length}`,
      );
    }
    if (callbackPreservesHidden(callbacks[0])) return [];

    const parameter = callbacks[0].params?.[0];
    if (parameter?.type !== "Identifier") {
      throw new Error(`${relPath(bundlePath)} model filter callback is not structurally supported`);
    }
    const name = parameter.name;
    return [{
      start: callbacks[0].start,
      end: callbacks[0].end,
      replacement:
        `${name}=>${name}.hidden===true||` +
        `${modelAllowlistSource()}.includes(${name}.model)`,
    }];
  }

  const request = requests[0];
  const original = source.slice(request.start, request.end);
  const replacement =
    `(/* ${MARKER} */(${original}).then(e=>e==null?e:{...e,data:` +
    `Array.isArray(e.data)?e.data.filter(e=>e.hidden===true||` +
    `${modelAllowlistSource()}.includes(e.model)):e.data}))`;

  return [{ start: request.start, end: request.end, replacement }];
}

function verifyBridgeBundle(source, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  const properties = findTargetProperties(ast);
  if (properties.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} verification expected one list-models-for-host handler, found ${properties.length}`,
    );
  }

  const propertySource = source.slice(properties[0].start, properties[0].end);
  const markerCount = propertySource.split(MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(
      `${relPath(bundlePath)} verification expected one ${MARKER} marker, found ${markerCount}`,
    );
  }
  for (const model of ALLOWED_MODELS) {
    if (!propertySource.includes(model)) {
      throw new Error(`${relPath(bundlePath)} verification missing ${model}`);
    }
  }
  if (findModelListRequests(properties[0].value).length !== 1) {
    throw new Error(`${relPath(bundlePath)} verification lost the model/list request`);
  }
  const callbacks = findAllowedModelFilterCallbacks(properties[0].value);
  if (callbacks.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} verification expected one exact latest-model allowlist, found ${callbacks.length}`,
    );
  }
  if (!callbackPreservesHidden(callbacks[0])) {
    throw new Error(
      `${relPath(bundlePath)} verification failed to preserve hidden internal models`,
    );
  }
}

function resolverBindingName(resolver, key) {
  const pattern = resolver.params?.[0];
  if (pattern?.type !== "ObjectPattern") return null;
  const property = pattern.properties.find((item) =>
    item.type === "Property" && staticString(item.key) === key,
  );
  return property?.value?.type === "Identifier" ? property.value.name : null;
}

function findModelSettingsResolvers(ast) {
  const resolvers = [];
  const requiredBindings = [
    "userSavedModelString",
    "userSavedReasoningEffort",
    "listModelsData",
  ];

  walk(ast, (node) => {
    const isFunction =
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression";
    if (!isFunction || node.params?.[0]?.type !== "ObjectPattern") return;
    if (requiredBindings.every((key) => resolverBindingName(node, key) != null)) {
      resolvers.push(node);
    }
  });
  return resolvers;
}

function isResolvedModelConditional(node) {
  if (node?.type !== "ConditionalExpression") return false;
  if (node.test?.type !== "Identifier") return false;
  if (node.consequent?.type !== "MemberExpression") return false;
  return (
    node.consequent.object?.type === "Identifier" &&
    node.consequent.object.name === node.test.name &&
    staticString(node.consequent.property) === "model"
  );
}

function findResolverModelProperties(resolver) {
  const properties = [];
  walk(resolver.body, (node) => {
    if (node.type !== "ReturnStatement" || node.argument?.type !== "ObjectExpression") {
      return;
    }
    for (const property of node.argument.properties) {
      if (
        property.type === "Property" &&
        staticString(property.key) === "model" &&
        isResolvedModelConditional(property.value)
      ) {
        properties.push(property);
      }
    }
  });
  return properties;
}

function validateResolverLookup(resolver, modelProperty, bindings, source, bundlePath) {
  const resultName = modelProperty.value.test.name;
  const declarations = [];
  walk(resolver.body, (node) => {
    if (node.type === "VariableDeclarator" && node.id?.name === resultName) {
      declarations.push(node);
    }
  });
  if (declarations.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} expected one resolved-model declaration, found ${declarations.length}`,
    );
  }

  const declarationSource = source.slice(declarations[0].start, declarations[0].end);
  if (
    !declarationSource.includes(bindings.userSavedModelString) ||
    !declarationSource.includes(bindings.listModelsData) ||
    !declarationSource.includes("models")
  ) {
    throw new Error(`${relPath(bundlePath)} resolved-model lookup structure changed`);
  }
}

function resolverStructure(ast, source, bundlePath) {
  const resolvers = findModelSettingsResolvers(ast);
  if (resolvers.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} expected one model-settings resolver, found ${resolvers.length}`,
    );
  }
  const resolver = resolvers[0];
  const properties = findResolverModelProperties(resolver);
  if (properties.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} expected one resolved model return property, found ${properties.length}`,
    );
  }
  const bindings = {
    userSavedModelString: resolverBindingName(resolver, "userSavedModelString"),
    listModelsData: resolverBindingName(resolver, "listModelsData"),
  };
  validateResolverLookup(resolver, properties[0], bindings, source, bundlePath);
  return { resolver, modelProperty: properties[0], bindings };
}

function collectSelectionPatches(ast, source, bundlePath) {
  const { modelProperty, bindings } = resolverStructure(ast, source, bundlePath);
  const propertySource = source.slice(modelProperty.start, modelProperty.end);
  if (propertySource.includes(MODEL_SELECTION_MARKER)) return [];

  const data = bindings.listModelsData;
  const allowlist = modelAllowlistSource();
  const replacement =
    `(/* ${MODEL_SELECTION_MARKER} */(` +
    `${allowlist}.includes(${data}?.defaultModel?.model)?${data}.defaultModel.model:` +
    `${data}?.models?.find(m=>m.hidden!==true&&${allowlist}.includes(m.model))?.model` +
    `)??"gpt-5.6-sol")`;

  return [{
    start: modelProperty.value.alternate.start,
    end: modelProperty.value.alternate.end,
    replacement,
  }];
}

function verifySelectionBundle(source, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  const { modelProperty } = resolverStructure(ast, source, bundlePath);
  // Acorn starts the alternate expression after a leading block comment, so
  // verify the complete property range to include the idempotence marker.
  const propertySource = source.slice(modelProperty.start, modelProperty.end);
  const markerCount = propertySource.split(MODEL_SELECTION_MARKER).length - 1;
  if (markerCount !== 1) {
    throw new Error(
      `${relPath(bundlePath)} verification expected one ${MODEL_SELECTION_MARKER} marker, found ${markerCount}`,
    );
  }
  for (const model of ALLOWED_MODELS) {
    if (!propertySource.includes(model)) {
      throw new Error(`${relPath(bundlePath)} selection fallback missing ${model}`);
    }
  }
  if (
    !propertySource.includes("defaultModel") ||
    !propertySource.includes(".find(") ||
    !propertySource.includes(".hidden!==true")
  ) {
    throw new Error(`${relPath(bundlePath)} selection fallback verification failed`);
  }
}

function platformList(requestedPlatform) {
  const requested = requestedPlatform === "unix"
    ? ["mac-arm64", "mac-x64"]
    : requestedPlatform
      ? [requestedPlatform]
      : ALL_PLATFORMS;

  return requested.filter((platform) =>
    fs.existsSync(path.join(SRC_DIR, platform, "_asar", "webview", "assets")),
  );
}

function isModelSelectionBundleSource(source, bundlePath = "<model-selection-candidate>") {
  if (
    !source.includes("userSavedModelString") ||
    !source.includes("userSavedReasoningEffort") ||
    !source.includes("listModelsData")
  ) {
    return false;
  }
  return findModelSettingsResolvers(parseBundle(source, bundlePath)).length > 0;
}

function candidateBundles(platform) {
  const assetsDir = path.join(SRC_DIR, platform, "_asar", "webview", "assets");
  const bridge = [];
  const selection = [];

  for (const filename of fs.readdirSync(assetsDir)) {
    if (!filename.endsWith(".js")) continue;
    const bundlePath = path.join(assetsDir, filename);
    const source = fs.readFileSync(bundlePath, "utf-8");
    if (source.includes("list-models-for-host") && source.includes("model/list")) {
      bridge.push({ path: bundlePath, source });
    }
    if (isModelSelectionBundleSource(source, bundlePath)) {
      selection.push({ path: bundlePath, source });
    }
  }

  return { bridge, selection };
}

function patchBundle({ bundle, collect, isCheck, label, verify, wouldPatchMessage }) {
  const ast = parseBundle(bundle.source, bundle.path);
  const patches = collect(ast, bundle.source, bundle.path);
  console.log(`    [${label}] ${relPath(bundle.path)}`);

  if (patches.length === 0) {
    verify(bundle.source, bundle.path);
    console.log("      [ok] already installed and verified");
    return 0;
  }
  if (isCheck) {
    console.log(`      [?] ${wouldPatchMessage}`);
    return 0;
  }

  let code = bundle.source;
  for (const patch of patches.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, patch.start) + patch.replacement + code.slice(patch.end);
  }
  fs.writeFileSync(bundle.path, code, "utf-8");
  verify(fs.readFileSync(bundle.path, "utf-8"), bundle.path);
  console.log("      [ok] patched and verified");
  return 1;
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const requestedPlatform = args.find((arg) =>
    [...ALL_PLATFORMS, "unix"].includes(arg),
  );
  const platforms = platformList(requestedPlatform);

  if (platforms.length === 0) {
    console.log("  [skip] No extracted renderer assets found");
    return;
  }

  let matched = 0;
  let patched = 0;

  for (const platform of platforms) {
    const candidates = candidateBundles(platform);
    if (candidates.bridge.length !== 1) {
      throw new Error(
        `${platform} expected exactly one model bridge bundle, found ${candidates.bridge.length}`,
      );
    }
    if (candidates.selection.length !== 1) {
      throw new Error(
        `${platform} expected exactly one model selection bundle, found ${candidates.selection.length}`,
      );
    }

    console.log(`  [${platform}]`);
    patched += patchBundle({
      bundle: candidates.bridge[0],
      collect: collectBridgePatches,
      isCheck,
      label: "catalog",
      verify: verifyBridgeBundle,
      wouldPatchMessage:
        `show only ${ALLOWED_MODELS.join(", ")} while preserving hidden internal models`,
    });
    patched += patchBundle({
      bundle: candidates.selection[0],
      collect: collectSelectionPatches,
      isCheck,
      label: "saved selection",
      verify: verifySelectionBundle,
      wouldPatchMessage: "coerce unavailable saved models to the latest allowed default",
    });
    matched += 2;
  }

  console.log(
    `  [ok] ${matched} bundle(s) structurally matched; ${patched} newly patched`,
  );
}

if (require.main === module) main();

module.exports = {
  ALLOWED_MODELS,
  callbackHasExactAllowedFilterShape,
  callbackPreservesHidden,
  findAllowedModelFilterCallbacks,
  isModelSelectionBundleSource,
};
