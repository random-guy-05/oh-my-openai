#!/usr/bin/env node
/**
 * Add a dedicated Chat mode beside Codex and ChatGPT Work.
 *
 * The renderer keeps the native Codex/Work shell mounted and overlays a
 * retained chatgpt.com webview. The main process owns authentication,
 * navigation policy, permissions, and hardening for one exact persistent
 * partition. Every edit is fail-closed and the resulting bundles are parsed
 * and structurally verified before either file is written.
 *
 * Usage:
 *   node scripts/patch-dedicated-chat-mode.js [mac-arm64|mac-x64|win|unix]
 *   node scripts/patch-dedicated-chat-mode.js mac-x64 --check
 */
const fs = require("fs");
const path = require("path");
const { parse } = require("acorn");
const { relPath, SRC_DIR } = require("./patch-util");

const ALL_PLATFORMS = ["mac-arm64", "mac-x64", "win"];
const LEGACY_RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode";
const LEGACY_MAIN_MARKER = "codex-rebuild:chatgpt-live-webview";
const V2_RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode-v2";
const V2_MAIN_MARKER = "codex-rebuild:chatgpt-live-webview-v2";
const V3_RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode-v3";
const V3_MAIN_MARKER = "codex-rebuild:chatgpt-live-webview-v3";
const V4_RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode-v4";
const V4_MAIN_MARKER = "codex-rebuild:chatgpt-live-webview-v4";
const V5_RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode-v5";
const V5_MAIN_MARKER = "codex-rebuild:chatgpt-live-webview-v5";
const V6_RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode-v6";
const V6_MAIN_MARKER = "codex-rebuild:chatgpt-live-webview-v6";
const RENDERER_MARKER = "codex-rebuild:dedicated-chat-mode-v7";
const MAIN_MARKER = "codex-rebuild:chatgpt-live-webview-v7";
const CHAT_PARTITION = "persist:codex-chatgpt-live";

function countOccurrences(source, needle) {
  if (needle.length === 0) throw new Error("Cannot count an empty anchor");
  let count = 0;
  let offset = 0;
  while ((offset = source.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function replaceExactly(source, needle, replacement, label, expected = 1) {
  const count = countOccurrences(source, needle);
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} anchor(s), found ${count}`);
  }
  return source.split(needle).join(replacement);
}

function parseBundle(source, bundlePath) {
  try {
    return parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (error) {
    const position = Number.isInteger(error.pos) ? error.pos : 0;
    const context = source.slice(Math.max(0, position - 160), position + 160);
    throw new Error(
      `${relPath(bundlePath)} failed to parse: ${error.message}\nContext: ${context}`,
    );
  }
}

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

function findFunction(ast, name, bundlePath) {
  const matches = [];
  walk(ast, (node) => {
    if (node.type === "FunctionDeclaration" && node.id?.name === name) {
      matches.push(node);
    }
  });
  if (matches.length !== 1) {
    throw new Error(
      `${relPath(bundlePath)} expected one function ${name}, found ${matches.length}`,
    );
  }
  return matches[0];
}

function applyPatches(source, patches) {
  let result = source;
  for (const patch of [...patches].sort((a, b) => b.start - a.start)) {
    result = result.slice(0, patch.start) + patch.replacement + result.slice(patch.end);
  }
  return result;
}

function fsyncDirectory(directory, { required = false } = {}) {
  let descriptor;
  try {
    descriptor = fs.openSync(directory, "r");
    fs.fsyncSync(descriptor);
  } catch (error) {
    if (required) throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function stageAtomicFile(filePath, content, suffix) {
  const tempPath = `${filePath}.dedicated-chat-${suffix}.tmp`;
  const mode = fs.statSync(filePath).mode;
  let descriptor;
  try {
    descriptor = fs.openSync(tempPath, "wx", mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } catch (error) {
    try { fs.unlinkSync(tempPath); } catch {}
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  return tempPath;
}

function writeDurableNew(filePath, content, mode = 0o600) {
  let descriptor;
  try {
    descriptor = fs.openSync(filePath, "wx", mode);
    fs.writeFileSync(descriptor, content, "utf8");
    fs.fsyncSync(descriptor);
  } catch (error) {
    try { fs.unlinkSync(filePath); } catch {}
    throw error;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
}

function transactionJournalPath(transactionRoot) {
  return path.join(transactionRoot, ".dedicated-chat-transaction.json");
}

function recoverAtomicTransaction(transactionRoot) {
  const journalPath = transactionJournalPath(transactionRoot);
  if (!fs.existsSync(journalPath)) return false;
  const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
  if (journal?.version !== 1 || !Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error(`Invalid dedicated Chat transaction journal: ${journalPath}`);
  }
  const rootPrefix = `${path.resolve(transactionRoot)}${path.sep}`;
  for (const entry of journal.entries) {
    if (
      typeof entry?.path !== "string" ||
      typeof entry?.backupPath !== "string" ||
      !path.resolve(entry.path).startsWith(rootPrefix) ||
      !path.resolve(entry.backupPath).startsWith(rootPrefix) ||
      !fs.existsSync(entry.path) ||
      !fs.existsSync(entry.backupPath)
    ) {
      throw new Error(`Unrecoverable dedicated Chat transaction entry in ${journalPath}`);
    }
  }
  const nonce = `${process.pid}-${Date.now()}-recovery`;
  for (let index = 0; index < journal.entries.length; index += 1) {
    const entry = journal.entries[index];
    const previous = fs.readFileSync(entry.backupPath, "utf8");
    const staged = stageAtomicFile(entry.path, previous, `${nonce}-${index}`);
    fs.renameSync(staged, entry.path);
    fsyncDirectory(path.dirname(entry.path), { required: true });
  }
  fs.unlinkSync(journalPath);
  fsyncDirectory(transactionRoot, { required: true });
  for (const entry of journal.entries) {
    try { fs.unlinkSync(entry.backupPath); } catch {}
  }
  for (const directory of new Set(journal.entries.map((entry) => path.dirname(entry.backupPath)))) {
    fsyncDirectory(directory, { required: true });
  }
  return true;
}

function atomicReplaceEntries(entries, { transactionRoot } = {}) {
  if (entries.length === 0) return;
  if (transactionRoot == null) {
    throw new Error("atomicReplaceEntries requires a transactionRoot");
  }
  recoverAtomicTransaction(transactionRoot);
  const nonce = `${process.pid}-${Date.now()}`;
  const staged = [];
  const journalPath = transactionJournalPath(transactionRoot);
  let journalPublished = false;
  let journalResolved = false;
  try {
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index];
      const tempPath = stageAtomicFile(entry.path, entry.next, `${nonce}-${index}`);
      entry.verify(fs.readFileSync(tempPath, "utf8"), entry.path);
      const backupPath = `${entry.path}.dedicated-chat-${nonce}.backup`;
      writeDurableNew(backupPath, entry.previous, fs.statSync(entry.path).mode);
      fsyncDirectory(path.dirname(backupPath), { required: true });
      staged.push({ ...entry, tempPath, backupPath });
    }
    const journal = {
      version: 1,
      createdAt: new Date().toISOString(),
      entries: staged.map(({ path: filePath, backupPath }) => ({ path: filePath, backupPath })),
    };
    const journalTemp = `${journalPath}.${nonce}.tmp`;
    writeDurableNew(journalTemp, JSON.stringify(journal));
    fs.renameSync(journalTemp, journalPath);
    journalPublished = true;
    fsyncDirectory(transactionRoot, { required: true });
    for (const entry of staged) {
      fs.renameSync(entry.tempPath, entry.path);
      fsyncDirectory(path.dirname(entry.path), { required: true });
    }
    for (const entry of staged) {
      entry.verify(fs.readFileSync(entry.path, "utf8"), entry.path);
    }
    fs.unlinkSync(journalPath);
    fsyncDirectory(transactionRoot, { required: true });
    journalResolved = true;
    for (const entry of staged) fs.unlinkSync(entry.backupPath);
    for (const directory of new Set(staged.map((entry) => path.dirname(entry.backupPath)))) {
      fsyncDirectory(directory, { required: true });
    }
  } catch (error) {
    if (fs.existsSync(journalPath)) {
      try {
        recoverAtomicTransaction(transactionRoot);
        journalResolved = true;
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Patch failed and journal recovery was incomplete");
      }
    }
    throw error;
  } finally {
    for (const entry of staged) {
      try { fs.unlinkSync(entry.tempPath); } catch {}
      // A failed directory fsync after journal unlink can make that journal
      // reappear after a crash. Preserve its only recoverable backups until
      // the unlink has crossed the required durability barrier.
      if (!journalPublished || journalResolved) {
        try { fs.unlinkSync(entry.backupPath); } catch {}
      }
    }
  }
}

const SELECTOR_SOURCE = String.raw`function XDe({mode:e,onModeSelect:t}){let n=Tn(),r=e===\`chat\`?\`Chat\`:e===\`codex\`?n.formatMessage(HF.codex):n.formatMessage({id:\`sidebarElectron.productMode.chatGptWork.plainText\`,defaultMessage:\`ChatGPT Work\`,description:\`Plain-text ChatGPT Work mode name for the accessible sidebar mode selector label\`}),i=e===\`chat\`?(0,VF.jsx)(\`span\`,{className:\`truncate font-openai-sans font-semibold\`,children:(0,VF.jsx)(Z,{id:\`sidebarElectron.productMode.chat\`,defaultMessage:\`Chat\`,description:\`Chat option in the sidebar mode selector\`})}):e===\`work\`?(0,VF.jsx)(Z,{...HF.chatGptWork,values:{chatGpt:eOe,work:$De}}):(0,VF.jsx)(\`span\`,{className:\`truncate font-openai-sans font-semibold\`,children:(0,VF.jsx)(Z,{...HF.codex})}),a=(0,VF.jsxs)(uu,{allowShrink:!0,"aria-label":n.formatMessage({id:\`sidebarElectron.productMode.trigger\`,defaultMessage:\`Switch mode, current mode: {mode}\`,description:\`Accessible label for the Codex, Work, and Chat mode selector\`},{mode:r}),className:\`group -ml-2 h-8 min-w-0 rounded-xl px-2 !text-[17px] !leading-6 font-medium\`,color:\`ghostActive\`,children:[i,(0,VF.jsx)(vp,{className:\`icon-2xs shrink-0 text-token-input-placeholder-foreground opacity-0 group-hover:opacity-100 group-data-[state=open]:opacity-100\`})]}),o=(0,VF.jsx)(Xf.Item,{className:\`py-2.5 text-base\`,RightIcon:e===\`work\`?Wu:void 0,SubText:(0,VF.jsx)(\`span\`,{className:\`text-token-description-foreground\`,children:(0,VF.jsx)(Z,{id:\`sidebarElectron.productMode.work.description.recommended\`,defaultMessage:\`Create, learn, and explore\`,description:\`Description beneath the ChatGPT Work option in the sidebar mode selector\`})}),onSelect:()=>t(\`work\`),children:(0,VF.jsx)(Z,{...HF.chatGptWork,values:{chatGpt:QDe,work:ZDe}})}),s=(0,VF.jsx)(Xf.Item,{className:\`py-2.5 text-base\`,RightIcon:e===\`codex\`?Wu:void 0,SubText:(0,VF.jsx)(\`span\`,{className:\`text-sm text-token-description-foreground\`,children:(0,VF.jsx)(Z,{id:\`sidebarElectron.productMode.codex.description.developer\`,defaultMessage:\`Build, debug, and ship\`,description:\`Description beneath the Codex option in the sidebar mode selector\`})}),onSelect:()=>t(\`codex\`),children:(0,VF.jsx)(\`span\`,{className:\`font-openai-sans\`,children:(0,VF.jsx)(Z,{...HF.codex})})}),c=(0,VF.jsx)(Xf.Item,{className:\`py-2.5 text-base\`,RightIcon:e===\`chat\`?Wu:void 0,SubText:(0,VF.jsx)(\`span\`,{className:\`text-sm text-token-description-foreground\`,children:(0,VF.jsx)(Z,{id:\`sidebarElectron.productMode.chat.description\`,defaultMessage:\`Your synced ChatGPT conversations and projects\`,description:\`Description beneath the Chat option in the sidebar mode selector\`})}),onSelect:()=>t(\`chat\`),children:(0,VF.jsx)(\`span\`,{className:\`font-openai-sans\`,children:(0,VF.jsx)(Z,{id:\`sidebarElectron.productMode.chat\`,defaultMessage:\`Chat\`,description:\`Chat option in the sidebar mode selector\`})})});return(0,VF.jsxs)(tm,{align:\`start\`,contentClassName:\`p-1.5\`,contentWidth:\`menuWide\`,sideOffset:4,triggerButton:a,children:[o,s,c]})}`.replaceAll("\\`", "`");

const CHAT_SURFACE_SOURCE = String.raw`/* ${RENDERER_MARKER} */function CodexDedicatedChatSurface({active:e}){let t=Hn(q),n=(0,az.useRef)(null),[r,i]=(0,az.useState)(e),[a,o]=(0,az.useState)(\`loading\`);(0,az.useEffect)(()=>{e&&i(!0)},[e]),(0,az.useEffect)(()=>{if(!r)return;let e=n.current;if(e==null)return;let t=()=>o(\`loading\`),r=()=>{try{String(e.getURL?.()??\`\`).startsWith(\`https://chatgpt.com\`)&&o(\`ready\`)}catch{}},i=t=>{t.errorCode!==-3&&o(\`error\`)},a=()=>o(\`error\`);return e.addEventListener(\`did-start-loading\`,t),e.addEventListener(\`did-stop-loading\`,r),e.addEventListener(\`did-finish-load\`,r),e.addEventListener(\`did-fail-load\`,i),e.addEventListener(\`render-process-gone\`,a),()=>{e.removeEventListener(\`did-start-loading\`,t),e.removeEventListener(\`did-stop-loading\`,r),e.removeEventListener(\`did-finish-load\`,r),e.removeEventListener(\`did-fail-load\`,i),e.removeEventListener(\`render-process-gone\`,a)}},[r]);if(!r)return null;let s=e=>{if(e===\`chat\`)return;ooe(t,e===\`work\`?Zm:zoe),t.set(CodexDedicatedChatMode,!1)},c=()=>{o(\`loading\`);try{n.current?.reload()}catch{o(\`error\`)}};return(0,mz.jsxs)(\`section\`,{"aria-hidden":e?void 0:!0,"aria-modal":e?!0:void 0,"data-codex-dedicated-chat":\`true\`,role:e?\`dialog\`:void 0,style:{position:\`fixed\`,inset:0,zIndex:2147483000,display:\`flex\`,flexDirection:\`column\`,background:\`var(--main-surface-primary, #fff)\`,visibility:e?\`visible\`:\`hidden\`,pointerEvents:e?\`auto\`:\`none\`,opacity:e?1:0},children:[(0,mz.jsx)(\`header\`,{className:\`draggable flex h-toolbar w-full shrink-0 items-center border-b border-token-border bg-token-main-surface-primary pe-2\`,style:{paddingLeft:\`78px\`,minHeight:\`48px\`},children:(0,mz.jsx)(\`div\`,{className:\`no-drag min-w-0\`,children:(0,mz.jsx)(XDe,{mode:\`chat\`,onModeSelect:s})})}),(0,mz.jsxs)(\`div\`,{className:\`relative min-h-0 min-w-0 flex-1 overflow-hidden bg-token-main-surface-primary\`,children:[(0,mz.jsx)(\`webview\`,{ref:n,partition:\`${CHAT_PARTITION}\`,src:\`about:blank\`,className:\`block h-full w-full bg-token-main-surface-primary\`,style:{height:\`100%\`,width:\`100%\`}}),a!==\`ready\`?(0,mz.jsx)(\`div\`,{className:\`absolute inset-0 flex items-center justify-center bg-token-main-surface-primary\`,children:a===\`error\`?(0,mz.jsxs)(\`div\`,{className:\`flex max-w-md flex-col items-center gap-3 px-6 text-center\`,children:[(0,mz.jsx)(\`div\`,{className:\`text-base font-semibold\`,children:\`ChatGPT could not load\`}),(0,mz.jsx)(\`div\`,{className:\`text-sm text-token-description-foreground\`,children:\`Check your connection, then try again.\`}),(0,mz.jsx)(uu,{color:\`secondary\`,onClick:c,children:\`Try again\`})]}):(0,mz.jsx)(\`div\`,{className:\`text-sm text-token-description-foreground\`,children:\`Loading ChatGPT…\`})}):null]})]})}`.replaceAll("\\`", "`");

const WRAPPER_SOURCE = String.raw`function WAe(){let e=X(CodexDedicatedChatMode);return(0,mz.jsxs)(mz.Fragment,{children:[(0,mz.jsx)(\`div\`,{inert:e?\`\`:void 0,"aria-hidden":e?!0:void 0,style:{display:e?\`none\`:\`contents\`},children:(0,mz.jsx)(CodexNativeShell,{})}),(0,mz.jsx)(CodexDedicatedChatSurface,{active:e})]})}`.replaceAll("\\`", "`");

const CHAT_SURFACE_SOURCE_V2 = String.raw`/* ${RENDERER_MARKER} */function CodexDedicatedChatSurface({active:e}){let t=Hn(q),{accountId:n}=VC(),r=(0,az.useRef)(null),[i,a]=(0,az.useState)(e),[o,s]=(0,az.useState)({kind:\`loading\`,generation:0});(0,az.useEffect)(()=>{e&&a(!0)},[e]),(0,az.useEffect)(()=>{if(!i)return;let e=r.current;if(e==null)return;let t=o.generation,n=()=>s(e=>e.generation===t?{...e,kind:\`loading\`}:e),i=()=>{try{String(e.getURL?.()??\`\`).startsWith(\`https://chatgpt.com\`)&&s(e=>e.generation===t&&e.kind!==\`error\`?{...e,kind:\`ready\`}:e)}catch{}},a=e=>{e.isMainFrame===!0&&e.errorCode!==-3&&s(e=>e.generation===t?{...e,kind:\`error\`}:e)},c=()=>s(e=>e.generation===t?{...e,kind:\`error\`}:e);return e.addEventListener(\`did-start-loading\`,n),e.addEventListener(\`did-stop-loading\`,i),e.addEventListener(\`did-finish-load\`,i),e.addEventListener(\`did-fail-load\`,a),e.addEventListener(\`render-process-gone\`,c),e.addEventListener(\`destroyed\`,c),i(),()=>{e.removeEventListener(\`did-start-loading\`,n),e.removeEventListener(\`did-stop-loading\`,i),e.removeEventListener(\`did-finish-load\`,i),e.removeEventListener(\`did-fail-load\`,a),e.removeEventListener(\`render-process-gone\`,c),e.removeEventListener(\`destroyed\`,c)}},[i,o.generation]);if(!i)return null;let c=e=>{if(e===\`chat\`)return;try{ooe(t,e===\`work\`?Zm:zoe)}finally{t.set(CodexDedicatedChatMode,!1)}},l=()=>s(e=>({kind:\`loading\`,generation:e.generation+1}));return(0,mz.jsxs)(\`section\`,{"aria-hidden":e?void 0:!0,"aria-modal":e?!0:void 0,"data-codex-dedicated-chat":\`true\`,role:e?\`dialog\`:void 0,style:{position:\`fixed\`,inset:0,zIndex:2147483000,display:\`flex\`,flexDirection:\`column\`,background:\`var(--main-surface-primary, #fff)\`,visibility:e?\`visible\`:\`hidden\`,pointerEvents:e?\`auto\`:\`none\`,opacity:e?1:0},children:[(0,mz.jsx)(\`header\`,{className:\`draggable flex h-toolbar w-full shrink-0 items-center border-b border-token-border bg-token-main-surface-primary pe-2\`,style:{paddingLeft:\`78px\`,minHeight:\`48px\`},children:(0,mz.jsx)(\`div\`,{className:\`no-drag min-w-0\`,children:(0,mz.jsx)(XDe,{mode:\`chat\`,onModeSelect:c})})}),(0,mz.jsxs)(\`div\`,{className:\`relative min-h-0 min-w-0 flex-1 overflow-hidden bg-token-main-surface-primary\`,children:[(0,mz.jsx)(\`webview\`,{ref:r,key:(n??\`\`)+\`:\`+o.generation,partition:\`${CHAT_PARTITION}\`,src:\`about:blank\`,"data-codex-chat-account-id":n??\`\`,className:\`block h-full w-full bg-token-main-surface-primary\`,style:{height:\`100%\`,width:\`100%\`}}),o.kind!==\`ready\`?(0,mz.jsx)(\`div\`,{className:\`absolute inset-0 flex items-center justify-center bg-token-main-surface-primary\`,children:o.kind===\`error\`?(0,mz.jsxs)(\`div\`,{className:\`flex max-w-md flex-col items-center gap-3 px-6 text-center\`,children:[(0,mz.jsx)(\`div\`,{className:\`text-base font-semibold\`,children:\`ChatGPT could not load\`}),(0,mz.jsx)(\`div\`,{className:\`text-sm text-token-description-foreground\`,children:\`Check your connection, then try again.\`}),(0,mz.jsx)(uu,{color:\`secondary\`,onClick:l,children:\`Try again\`})]}):(0,mz.jsx)(\`div\`,{className:\`text-sm text-token-description-foreground\`,children:\`Loading ChatGPT…\`})}):null]})]})}`.replaceAll("\\`", "`");

const WRAPPER_SOURCE_V2 = String.raw`function WAe(){let e=X(CodexDedicatedChatMode);return(0,mz.jsxs)(mz.Fragment,{children:[(0,mz.jsx)(\`div\`,{inert:e?\`\`:void 0,"aria-hidden":e?!0:void 0,style:{display:\`contents\`,visibility:e?\`hidden\`:\`visible\`,pointerEvents:e?\`none\`:\`auto\`},children:(0,mz.jsx)(CodexNativeShell,{})}),(0,mz.jsx)(CodexDedicatedChatSurface,{active:e})]})}`.replaceAll("\\`", "`");

const MAIN_PERMISSION_SOURCE_V2 = String.raw`function CDR_CHAT_PERMISSION(e,t,n,r={}){if(t!==\`clipboard-sanitized-write\`)return!1;let i=r.requestingUrl??n??(e!=null&&!e.isDestroyed()?e.getURL():null);return MR(i)&&(r.embeddingOrigin==null||MR(r.embeddingOrigin))&&(r.securityOrigin==null||MR(r.securityOrigin))&&(e==null||!e.isDestroyed()&&MR(e.getURL()))}`.replaceAll("\\`", "`");
const MAIN_HARDEN_SOURCE_V2 = String.raw`function CDR_CHAT_HARDEN(e,t){e.partition=CDR_CHAT_PARTITION,e.src=\`about:blank\`,delete e.preload,delete e.allowpopups,delete e.disablewebsecurity,delete e.webpreferences,t.session=CDR_CHAT_SESSION(),delete t.preload,Object.assign(t,{sandbox:!0,devTools:!1,nodeIntegration:!1,nodeIntegrationInSubFrames:!1,nodeIntegrationInWorker:!1,contextIsolation:!0,webSecurity:!0,allowRunningInsecureContent:!1,webviewTag:!1,plugins:!1,disablePopups:!0,spellcheck:!0})}`.replaceAll("\\`", "`");
const MAIN_AUTH_SOURCE_V2 = String.raw`async function CDR_CHAT_AUTHENTICATE(e,t,n){await wR({accountId:n,getAuthToken:t,session:e.session,targetUrl:CDR_CHAT_HOME,webContents:e})}`.replaceAll("\\`", "`");
const MAIN_INSTALL_SOURCE_V2 = String.raw`function CDR_CHAT_INSTALL({getAuthToken:e,owner:t}){let n=null,r=null,i=null,a=!1,o=(e,o,s)=>{if(!CDR_CHAT_PARAMS(s))return;if(a||n!=null||i!=null&&!i.isDestroyed()||s.src!==\`about:blank\`){e.preventDefault();return}try{let e=typeof s[\`data-codex-chat-account-id\`]===\`string\`&&s[\`data-codex-chat-account-id\`].length>0?s[\`data-codex-chat-account-id\`]:null;CDR_CHAT_HARDEN(s,o),n={accountId:e},r=setTimeout(()=>{n=null,r=null},3e4)}catch(t){e.preventDefault(),CDR_CHAT_LOG().warning(\`Rejected ChatGPT webview during hardening\`,{safe:{},sensitive:{error:t}})}},s=(t,o)=>{if(!CDR_CHAT_CONTENTS(o))return;let s=n;if(a||s==null||i!=null&&!i.isDestroyed()){o.isDestroyed()||o.close();return}n=null,r!=null&&clearTimeout(r),r=null,i=o;let l=CDR_CHAT_LOCK_NAVIGATION(o);o.once(\`destroyed\`,()=>{l(),i===o&&(i=null)}),CDR_CHAT_AUTHENTICATE(o,e,s.accountId).catch(e=>{CDR_CHAT_LOG().warning(\`Failed ChatGPT webview auth handoff\`,{safe:{},sensitive:{error:e}}),o.isDestroyed()||o.close()})},l=()=>{a||(a=!0,r!=null&&clearTimeout(r),t.removeListener(\`will-attach-webview\`,o),t.removeListener(\`did-attach-webview\`,s),t.removeListener(\`destroyed\`,l),i!=null&&!i.isDestroyed()&&i.close())};return t.on(\`will-attach-webview\`,o),t.on(\`did-attach-webview\`,s),t.on(\`destroyed\`,l),l}`.replaceAll("\\`", "`");

const CHAT_SURFACE_SOURCE_V4 = CHAT_SURFACE_SOURCE_V2
  .replace('"data-codex-chat-account-id":n??``,', "");
const CHAT_SURFACE_SOURCE_V5 = CHAT_SURFACE_SOURCE_V4
  .replace("i=()=>{try{String(e.getURL?.()", "u=()=>{try{String(e.getURL?.()")
  .replaceAll("did-stop-loading`,i)", "did-stop-loading`,u)")
  .replaceAll("did-finish-load`,i)", "did-finish-load`,u)")
  .replace("),i(),()=>{", "),u(),()=>{");
const CHAT_MENU_CLEARANCE_STYLE = `.codex-chat-mode-header:has(button[data-state="open"]){min-height:220px!important;align-items:flex-start;padding-top:8px}body:has([data-codex-dedicated-chat][role="dialog"])>div:has(>[role="menu"]){z-index:2147483647!important}`;
const CHAT_SURFACE_SOURCE_V7 = CHAT_SURFACE_SOURCE_V5.replace(
  "children:[(0,mz.jsx)(`header`,{className:`draggable flex",
  `children:[(0,mz.jsx)(\`style\`,{children:\`${CHAT_MENU_CLEARANCE_STYLE}\`}),(0,mz.jsx)(\`header\`,{className:\`codex-chat-mode-header draggable flex`,
);
const MAIN_ACCOUNT_SOURCE_V3 = String.raw`function CDR_CHAT_ACCOUNT_ID(e){let t=e.split(\`.\`)[1];if(t==null)return null;try{let e=JSON.parse(Buffer.from(t,\`base64url\`).toString(\`utf8\`)),n=e?.[\`https://api.openai.com/auth\`],r=n?.chatgpt_account_id??n?.account_id;return typeof r===\`string\`&&r.length>0?r:null}catch{return null}}`.replaceAll("\\`", "`");
const MAIN_AUTH_SOURCE_V3 = String.raw`async function CDR_CHAT_AUTHENTICATE(e,t){let n=await OR(t),r=CDR_CHAT_ACCOUNT_ID(n);await wR({accountId:r,getAuthToken:()=>Promise.resolve(n),session:e.session,targetUrl:CDR_CHAT_HOME,webContents:e})}`.replaceAll("\\`", "`");
const MAIN_INSTALL_SOURCE_V3 = String.raw`function CDR_CHAT_INSTALL({getAuthToken:e,owner:t}){let n=!1,r=null,i=null,a=!1,o=(e,o,s)=>{if(!CDR_CHAT_PARAMS(s))return;if(a||n||i!=null&&!i.isDestroyed()||s.src!==\`about:blank\`){e.preventDefault();return}try{CDR_CHAT_HARDEN(s,o),n=!0,r=setTimeout(()=>{n=!1,r=null},3e4)}catch(t){e.preventDefault(),CDR_CHAT_LOG().warning(\`Rejected ChatGPT webview during hardening\`,{safe:{},sensitive:{error:t}})}},s=(t,o)=>{if(!CDR_CHAT_CONTENTS(o))return;if(a||!n||i!=null&&!i.isDestroyed()){o.isDestroyed()||o.close();return}n=!1,r!=null&&clearTimeout(r),r=null,i=o;let s=CDR_CHAT_LOCK_NAVIGATION(o);o.once(\`destroyed\`,()=>{s(),i===o&&(i=null)}),CDR_CHAT_AUTHENTICATE(o,e).catch(e=>{CDR_CHAT_LOG().warning(\`Failed ChatGPT webview auth handoff\`,{safe:{},sensitive:{error:e}}),o.isDestroyed()||o.close()})},l=()=>{a||(a=!0,r!=null&&clearTimeout(r),t.removeListener(\`will-attach-webview\`,o),t.removeListener(\`did-attach-webview\`,s),t.removeListener(\`destroyed\`,l),i!=null&&!i.isDestroyed()&&i.close())};return t.on(\`will-attach-webview\`,o),t.on(\`did-attach-webview\`,s),t.on(\`destroyed\`,l),l}`.replaceAll("\\`", "`");

const MAIN_INSERTION = String.raw`
/* ${MAIN_MARKER} */
const CDR_CHAT_PARTITION=\`${CHAT_PARTITION}\`,CDR_CHAT_HOME=\`${"${hR}"}/\`,CDR_CHAT_LOG=r.a(\`chatgpt-live-webview\`),CDR_CHAT_CONFIGURED_SESSIONS=new WeakSet;
function CDR_CHAT_PARAMS(e){return e.partition===CDR_CHAT_PARTITION}
function CDR_CHAT_CONTENTS(e){return e.session===c.session.fromPartition(CDR_CHAT_PARTITION)}
function CDR_CHAT_PERMISSION(e,t,n,r={}){if(t!==\`clipboard-sanitized-write\`&&t!==\`media\`)return!1;let i=r.requestingUrl??n??(e!=null&&!e.isDestroyed()?e.getURL():null);return MR(i)&&(r.embeddingOrigin==null||MR(r.embeddingOrigin))&&(r.securityOrigin==null||MR(r.securityOrigin))&&(e==null||!e.isDestroyed()&&MR(e.getURL()))}
function CDR_CHAT_SESSION(){let e=c.session.fromPartition(CDR_CHAT_PARTITION);return CDR_CHAT_CONFIGURED_SESSIONS.has(e)||(e.setPermissionCheckHandler((e,t,n,r)=>CDR_CHAT_PERMISSION(e,t,n,r)),e.setPermissionRequestHandler((e,t,n,r)=>n(CDR_CHAT_PERMISSION(e,t,r?.requestingUrl,r))),e.webRequest.onBeforeRequest((e,t)=>t({cancel:e.resourceType===\`mainFrame\`&&e.url!==\`about:blank\`&&!MR(e.url)})),CDR_CHAT_CONFIGURED_SESSIONS.add(e)),e}
function CDR_CHAT_HARDEN(e,t){e.partition=CDR_CHAT_PARTITION,e.src=\`about:blank\`,delete e.preload,delete e.allowpopups,delete e.disablewebsecurity,delete e.webpreferences,t.session=CDR_CHAT_SESSION(),delete t.preload,Object.assign(t,{sandbox:!0,devTools:!0,nodeIntegration:!1,nodeIntegrationInSubFrames:!1,nodeIntegrationInWorker:!1,contextIsolation:!0,webSecurity:!0,allowRunningInsecureContent:!1,webviewTag:!1,plugins:!1,disablePopups:!0,spellcheck:!0})}
function CDR_CHAT_LOCK_NAVIGATION(e){let t=(t,n,r=!0)=>{r&&n!==\`about:blank\`&&!MR(n)&&t.preventDefault()},n=e=>t(e,e.url,e.isMainFrame),r=(e,n)=>t(e,e.url??n),i=(e,n)=>t(e,e.url??n);return e.on(\`will-frame-navigate\`,n),e.on(\`will-navigate\`,r),e.on(\`will-redirect\`,i),e.setWindowOpenHandler(({url:t})=>(MR(t)?e.loadURL(t).catch(e=>{CDR_CHAT_LOG().warning(\`Failed same-origin ChatGPT popup navigation\`,{safe:{},sensitive:{error:e}})}):Qz(t)&&LA({request:{openTarget:\`external-browser\`,url:t}}).catch(e=>{CDR_CHAT_LOG().warning(\`Failed external ChatGPT link\`,{safe:{},sensitive:{error:e}})}),{action:\`deny\`})),()=>{e.isDestroyed()||(e.removeListener(\`will-frame-navigate\`,n),e.removeListener(\`will-navigate\`,r),e.removeListener(\`will-redirect\`,i))}}
async function CDR_CHAT_AUTHENTICATE(e,t){await kR(e,await OR(t)),e.isDestroyed()||await e.loadURL(CDR_CHAT_HOME)}
function CDR_CHAT_INSTALL({getAuthToken:e,owner:t}){let n=!1,r=null,i=null,a=!1,o=(e,o,s)=>{if(!CDR_CHAT_PARAMS(s))return;if(a||n||i!=null&&!i.isDestroyed()||s.src!==\`about:blank\`){e.preventDefault();return}try{CDR_CHAT_HARDEN(s,o),n=!0,r=setTimeout(()=>{n=!1,r=null},1e4)}catch(t){e.preventDefault(),CDR_CHAT_LOG().warning(\`Rejected ChatGPT webview during hardening\`,{safe:{},sensitive:{error:t}})}},s=(t,o)=>{if(!CDR_CHAT_CONTENTS(o))return;if(a||!n||i!=null&&!i.isDestroyed()){o.isDestroyed()||o.close();return}n=!1,r!=null&&clearTimeout(r),r=null,i=o;let s=CDR_CHAT_LOCK_NAVIGATION(o);o.once(\`destroyed\`,()=>{s(),i===o&&(i=null)}),CDR_CHAT_AUTHENTICATE(o,e).catch(e=>{CDR_CHAT_LOG().warning(\`Failed ChatGPT webview auth handoff\`,{safe:{},sensitive:{error:e}}),o.isDestroyed()||o.close()})},l=()=>{a||(a=!0,r!=null&&clearTimeout(r),t.removeListener(\`will-attach-webview\`,o),t.removeListener(\`did-attach-webview\`,s),t.removeListener(\`destroyed\`,l),i!=null&&!i.isDestroyed()&&i.close())};return t.on(\`will-attach-webview\`,o),t.on(\`did-attach-webview\`,s),t.on(\`destroyed\`,l),l}
`.replaceAll("\\`", "`");

function replaceFunctions(source, bundlePath, replacements) {
  const ast = parseBundle(source, bundlePath);
  const patches = [];
  for (const [name, replacement] of Object.entries(replacements)) {
    const node = findFunction(ast, name, bundlePath);
    patches.push({ start: node.start, end: node.end, replacement });
  }
  return applyPatches(source, patches);
}

function upgradeRenderer(source, bundlePath, previousMarker) {
  const withoutLegacyMarker = replaceExactly(
    source,
    `/* ${previousMarker} */`,
    "",
    `${relPath(bundlePath)} previous renderer marker`,
  );
  const code = replaceFunctions(withoutLegacyMarker, bundlePath, {
    CodexDedicatedChatSurface: CHAT_SURFACE_SOURCE_V7,
    WAe: WRAPPER_SOURCE_V2,
  });
  verifyRenderer(code, bundlePath);
  return code;
}

function installCurrentMainFunctions(source, bundlePath, { previousMarker = null } = {}) {
  let code = replaceFunctions(source, bundlePath, {
    CDR_CHAT_PERMISSION: MAIN_PERMISSION_SOURCE_V2,
    CDR_CHAT_HARDEN: MAIN_HARDEN_SOURCE_V2,
    CDR_CHAT_AUTHENTICATE: MAIN_AUTH_SOURCE_V3,
    CDR_CHAT_INSTALL: MAIN_INSTALL_SOURCE_V3,
  });
  if (code.includes("function CDR_CHAT_ACCOUNT_ID(")) {
    code = replaceFunctions(code, bundlePath, {
      CDR_CHAT_ACCOUNT_ID: MAIN_ACCOUNT_SOURCE_V3,
    });
  } else {
    const ast = parseBundle(code, bundlePath);
    const params = findFunction(ast, "CDR_CHAT_PARAMS", bundlePath);
    code = code.slice(0, params.end) + MAIN_ACCOUNT_SOURCE_V3 + code.slice(params.end);
  }
  if (previousMarker != null) {
    code = replaceExactly(
      code,
      previousMarker,
      MAIN_MARKER,
      `${relPath(bundlePath)} previous main marker`,
    );
  }
  return code;
}

function patchRenderer(source, bundlePath) {
  if (source.includes(RENDERER_MARKER)) {
    verifyRenderer(source, bundlePath);
    return { source, changed: false };
  }
  const previousRendererMarker = source.includes(V6_RENDERER_MARKER)
    ? V6_RENDERER_MARKER
    : source.includes(V5_RENDERER_MARKER)
      ? V5_RENDERER_MARKER
      : source.includes(V4_RENDERER_MARKER)
        ? V4_RENDERER_MARKER
        : source.includes(V3_RENDERER_MARKER)
          ? V3_RENDERER_MARKER
          : source.includes(V2_RENDERER_MARKER)
            ? V2_RENDERER_MARKER
            : source.includes(LEGACY_RENDERER_MARKER)
              ? LEGACY_RENDERER_MARKER
              : null;
  if (previousRendererMarker != null) {
    return {
      source: upgradeRenderer(source, bundlePath, previousRendererMarker),
      changed: true,
    };
  }
  for (const identifier of ["CodexDedicatedChatMode", "CodexDedicatedChatSurface", "CodexNativeShell"]) {
    if (source.includes(identifier)) {
      throw new Error(`${relPath(bundlePath)} has an unexpected ${identifier} collision`);
    }
  }

  const ast = parseBundle(source, bundlePath);
  const selector = findFunction(ast, "XDe", bundlePath);
  const sidebar = findFunction(ast, "WDe", bundlePath);
  const shell = findFunction(ast, "WAe", bundlePath);
  const sidebarSource = source.slice(sidebar.start, sidebar.end);
  const shellSource = source.slice(shell.start, shell.end);

  let patchedSidebar = replaceExactly(
    sidebarSource,
    "r===`codex`&&n?(0,RF.jsx)(bDe,{}):null",
    "null",
    `${relPath(bundlePath)} old sidebar Chat row`,
  );
  let renamedShell = replaceExactly(
    shellSource,
    "function WAe()",
    "function CodexNativeShell()",
    `${relPath(bundlePath)} shell declaration`,
  );

  let code = applyPatches(source, [
    { start: selector.start, end: selector.end, replacement: SELECTOR_SOURCE },
    { start: sidebar.start, end: sidebar.end, replacement: patchedSidebar },
    {
      start: shell.start,
      end: shell.end,
      replacement: `${CHAT_SURFACE_SOURCE_V7}${renamedShell}${WRAPPER_SOURCE_V2}`,
    },
  ]);

  code = replaceExactly(
    code,
    "UF,WF=e((()=>{$(),at(),UF=Pt(q,!1)}));",
    "UF,CodexDedicatedChatMode,WF=e((()=>{$(),at(),UF=Pt(q,!1),CodexDedicatedChatMode=Pt(q,!1)}));",
    `${relPath(bundlePath)} dedicated Chat atom`,
  );
  code = replaceExactly(
    code,
    "u=Xm(`824038554`)",
    "u=(Xm(`824038554`),!0)",
    `${relPath(bundlePath)} product-mode feature gate`,
  );
  code = replaceExactly(
    code,
    "let k=gg(O),A=Rh(),j=br(Qe.conversationDetailMode)",
    "let k=gg(O),CodexChatActive=X(CodexDedicatedChatMode),A=Rh(),j=br(Qe.conversationDetailMode)",
    `${relPath(bundlePath)} Chat mode hook`,
  );
  code = replaceExactly(
    code,
    "I=j==null&&F===`non_coding`||A===`STEPS_PROSE`?`work`:`codex`",
    "I=CodexChatActive?`chat`:(j==null&&F===`non_coding`||A===`STEPS_PROSE`?`work`:`codex`)",
    `${relPath(bundlePath)} selected product mode`,
  );
  code = replaceExactly(
    code,
    "onModeSelect:e=>{ooe(a,e===`work`?Zm:zoe)}",
    "onModeSelect:e=>{if(e===`chat`){a.set(CodexDedicatedChatMode,!0);return}a.set(CodexDedicatedChatMode,!1),ooe(a,e===`work`?Zm:zoe)}",
    `${relPath(bundlePath)} product-mode selection callback`,
  );

  verifyRenderer(code, bundlePath);
  return { source: code, changed: true };
}

function patchMain(source, bundlePath) {
  if (source.includes(MAIN_MARKER)) {
    verifyMain(source, bundlePath);
    return { source, changed: false };
  }
  const previousMainMarker = source.includes(V6_MAIN_MARKER)
    ? V6_MAIN_MARKER
    : source.includes(V5_MAIN_MARKER)
      ? V5_MAIN_MARKER
      : source.includes(V4_MAIN_MARKER)
        ? V4_MAIN_MARKER
        : source.includes(V3_MAIN_MARKER)
          ? V3_MAIN_MARKER
          : source.includes(V2_MAIN_MARKER)
            ? V2_MAIN_MARKER
            : source.includes(LEGACY_MAIN_MARKER)
              ? LEGACY_MAIN_MARKER
              : null;
  if (previousMainMarker != null) {
    const code = installCurrentMainFunctions(source, bundlePath, {
      previousMarker: previousMainMarker,
    });
    verifyMain(code, bundlePath);
    return { source: code, changed: true };
  }
  for (const identifier of ["CDR_CHAT_PARTITION", "CDR_CHAT_INSTALL", "CDR_CHAT_HARDEN"]) {
    if (source.includes(identifier)) {
      throw new Error(`${relPath(bundlePath)} has an unexpected ${identifier} collision`);
    }
  }
  parseBundle(source, bundlePath);
  let code = replaceExactly(
    source,
    "function MR(e){try{return new URL(e).origin===hR}catch{return!1}}",
    `function MR(e){try{return new URL(e).origin===hR}catch{return!1}}${MAIN_INSERTION}`,
    `${relPath(bundlePath)} ChatGPT-origin helper`,
  );
  code = replaceExactly(
    code,
    "if(n.Ba(s.partition)!=null||oz(s))return",
    "if(n.Ba(s.partition)!=null||oz(s)||CDR_CHAT_PARAMS(s))return",
    `${relPath(bundlePath)} Browser will-attach exclusion`,
  );
  code = replaceExactly(
    code,
    "if(Zz(n.session)||sz(n))return",
    "if(Zz(n.session)||sz(n)||CDR_CHAT_CONTENTS(n))return",
    `${relPath(bundlePath)} Browser did-attach exclusion`,
  );
  code = replaceExactly(
    code,
    "o===`primary`&&cz({",
    "o===`primary`&&(cz({",
    `${relPath(bundlePath)} primary checkout manager`,
  );
  code = replaceExactly(
    code,
    "onReturnToCodex:()=>{N.isDestroyed()||N.send(B,{type:`navigate-back`})},owner:N}))",
    "onReturnToCodex:()=>{N.isDestroyed()||N.send(B,{type:`navigate-back`})},owner:N}),CDR_CHAT_INSTALL({getAuthToken:this.options.getChatGptWebviewAuthToken,owner:N})))",
    `${relPath(bundlePath)} primary Chat manager install`,
  );
  code = installCurrentMainFunctions(code, bundlePath);
  verifyMain(code, bundlePath);
  return { source: code, changed: true };
}

function verifyRenderer(source, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  for (const [marker, expected] of [[RENDERER_MARKER, 1], [CHAT_PARTITION, 1]]) {
    const count = countOccurrences(source, marker);
    if (count !== expected) {
      throw new Error(`${relPath(bundlePath)} expected ${expected} ${marker}, found ${count}`);
    }
  }
  for (const name of ["XDe", "WDe", "WAe", "CodexNativeShell", "CodexDedicatedChatSurface"]) {
    findFunction(ast, name, bundlePath);
  }
  const selectorNode = findFunction(ast, "XDe", bundlePath);
  const selectorSource = source.slice(selectorNode.start, selectorNode.end);
  if (!selectorSource.includes("children:[o,s,c]") || !selectorSource.includes("onSelect:()=>t(`chat`)")) {
    throw new Error(`${relPath(bundlePath)} three-way mode selector verification failed`);
  }
  if (!source.includes("CodexChatActive?`chat`:") || !source.includes("a.set(CodexDedicatedChatMode,!0)")) {
    throw new Error(`${relPath(bundlePath)} dedicated Chat atom wiring verification failed`);
  }
  const sidebar = findFunction(ast, "WDe", bundlePath);
  if (source.slice(sidebar.start, sidebar.end).includes("(bDe,{}")) {
    throw new Error(`${relPath(bundlePath)} still renders the old sidebar Chat row`);
  }
  if (!source.includes("function bDe()")) {
    throw new Error(`${relPath(bundlePath)} unexpectedly removed Quick Chat internals`);
  }
  if (source.includes("ooe(a,e===`chat`") || source.includes("ooe(t,e===`chat`")) {
    throw new Error(`${relPath(bundlePath)} incorrectly routes Chat through conversationDetailMode`);
  }
  const surface = findFunction(ast, "CodexDedicatedChatSurface", bundlePath);
  const surfaceSource = source.slice(surface.start, surface.end);
  for (const required of [
    `partition:\`${CHAT_PARTITION}\``,
    "src:`about:blank`",
    "visibility:e?`visible`:`hidden`",
    "XDe,{mode:`chat`",
    "generation:e.generation+1",
    "e.isMainFrame===!0",
  ]) {
    if (!surfaceSource.includes(required)) {
      throw new Error(`${relPath(bundlePath)} Chat surface is missing ${required}`);
    }
  }
  for (const forbidden of ["preload:", "allowpopups", "webpreferences"] ) {
    if (surfaceSource.includes(forbidden)) {
      throw new Error(`${relPath(bundlePath)} Chat surface contains forbidden ${forbidden}`);
    }
  }
  if (surfaceSource.includes("data-codex-chat-account-id")) {
    throw new Error(`${relPath(bundlePath)} Chat surface contains an untrusted account transport`);
  }
  if (
    !surfaceSource.includes("{accountId:n}=VC()") ||
    !surfaceSource.includes("key:(n??``)+`:`+o.generation")
  ) {
    throw new Error(`${relPath(bundlePath)} Chat account-change remount verification failed`);
  }
  if (
    !surfaceSource.includes("u=()=>{try{String(e.getURL?.()") ||
    surfaceSource.includes("i=()=>{try{String(e.getURL?.()")
  ) {
    throw new Error(`${relPath(bundlePath)} Chat load callback shadows its state binding`);
  }
  if (!surfaceSource.includes(CHAT_MENU_CLEARANCE_STYLE)) {
    throw new Error(`${relPath(bundlePath)} Chat mode selector lacks webview menu clearance`);
  }
  const wrapper = findFunction(ast, "WAe", bundlePath);
  const wrapperSource = source.slice(wrapper.start, wrapper.end);
  if (
    wrapperSource.includes("display:e?`none`") ||
    !wrapperSource.includes("display:`contents`") ||
    !wrapperSource.includes("visibility:e?`hidden`:`visible`")
  ) {
    throw new Error(`${relPath(bundlePath)} native shell retention verification failed`);
  }
}

function staticPropertyName(node) {
  if (node?.type === "Identifier") return node.name;
  if (node?.type === "Literal" && typeof node.value === "string") return node.value;
  return null;
}

function staticBoolean(node) {
  if (node?.type === "Literal" && typeof node.value === "boolean") return node.value;
  if (
    node?.type === "UnaryExpression" &&
    node.operator === "!" &&
    node.argument?.type === "Literal"
  ) {
    return !node.argument.value;
  }
  return null;
}

function hardeningOptions(ast, bundlePath) {
  const hardenNode = findFunction(ast, "CDR_CHAT_HARDEN", bundlePath);
  const assignments = [];
  walk(hardenNode.body, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee?.type === "MemberExpression" &&
      node.callee.object?.type === "Identifier" &&
      node.callee.object.name === "Object" &&
      staticPropertyName(node.callee.property) === "assign" &&
      node.arguments?.[0]?.type === "Identifier" &&
      node.arguments[0].name === "t" &&
      node.arguments?.[1]?.type === "ObjectExpression"
    ) {
      assignments.push(node.arguments[1]);
    }
  });
  if (assignments.length !== 1) {
    throw new Error(`${relPath(bundlePath)} expected one hardening Object.assign, found ${assignments.length}`);
  }
  const options = new Map();
  for (const property of assignments[0].properties) {
    if (property.type !== "Property") continue;
    options.set(staticPropertyName(property.key), staticBoolean(property.value));
  }
  return options;
}

function verifyMain(source, bundlePath) {
  const ast = parseBundle(source, bundlePath);
  if (countOccurrences(source, MAIN_MARKER) !== 1) {
    throw new Error(`${relPath(bundlePath)} main marker count is not one`);
  }
  const harden = source.slice(
    findFunction(ast, "CDR_CHAT_HARDEN", bundlePath).start,
    findFunction(ast, "CDR_CHAT_HARDEN", bundlePath).end,
  );
  const session = source.slice(
    findFunction(ast, "CDR_CHAT_SESSION", bundlePath).start,
    findFunction(ast, "CDR_CHAT_SESSION", bundlePath).end,
  );
  const authenticate = source.slice(
    findFunction(ast, "CDR_CHAT_AUTHENTICATE", bundlePath).start,
    findFunction(ast, "CDR_CHAT_AUTHENTICATE", bundlePath).end,
  );
  if (harden !== MAIN_HARDEN_SOURCE_V2) {
    throw new Error(`${relPath(bundlePath)} Chat hardening function differs from the audited source`);
  }
  if (!harden.includes("delete e.preload") || !harden.includes("delete t.preload")) {
    throw new Error(`${relPath(bundlePath)} Chat preload deletion verification failed`);
  }
  const expectedOptions = new Map([
    ["sandbox", true],
    ["devTools", false],
    ["nodeIntegration", false],
    ["nodeIntegrationInSubFrames", false],
    ["nodeIntegrationInWorker", false],
    ["contextIsolation", true],
    ["webSecurity", true],
    ["allowRunningInsecureContent", false],
    ["webviewTag", false],
    ["plugins", false],
    ["disablePopups", true],
  ]);
  const actualOptions = hardeningOptions(ast, bundlePath);
  for (const [name, expected] of expectedOptions) {
    if (actualOptions.get(name) !== expected) {
      throw new Error(`${relPath(bundlePath)} Chat hardening option ${name} must be ${expected}`);
    }
  }
  if (!session.includes("e.resourceType===`mainFrame`") || !session.includes("!MR(e.url)")) {
    throw new Error(`${relPath(bundlePath)} Chat session main-frame origin guard is missing`);
  }
  if (authenticate !== MAIN_AUTH_SOURCE_V3) {
    throw new Error(`${relPath(bundlePath)} Chat auth handoff verification failed`);
  }
  const accountNode = findFunction(ast, "CDR_CHAT_ACCOUNT_ID", bundlePath);
  const accountSource = source.slice(accountNode.start, accountNode.end);
  if (accountSource !== MAIN_ACCOUNT_SOURCE_V3) {
    throw new Error(`${relPath(bundlePath)} trusted token account binding verification failed`);
  }
  const permissionNode = findFunction(ast, "CDR_CHAT_PERMISSION", bundlePath);
  const permissionSource = source.slice(permissionNode.start, permissionNode.end);
  if (permissionSource !== MAIN_PERMISSION_SOURCE_V2) {
    throw new Error(`${relPath(bundlePath)} Chat permission allowlist verification failed`);
  }
  const installNode = findFunction(ast, "CDR_CHAT_INSTALL", bundlePath);
  const installSource = source.slice(installNode.start, installNode.end);
  if (installSource !== MAIN_INSTALL_SOURCE_V3) {
    throw new Error(`${relPath(bundlePath)} Chat attach lifecycle verification failed`);
  }
  const required = [
    `CDR_CHAT_PARTITION=\`${CHAT_PARTITION}\``,
    "||CDR_CHAT_PARAMS(s))return",
    "||CDR_CHAT_CONTENTS(n))return",
    "CDR_CHAT_INSTALL({getAuthToken:this.options.getChatGptWebviewAuthToken,owner:N})",
  ];
  for (const item of required) {
    if (!source.includes(item)) {
      throw new Error(`${relPath(bundlePath)} Chat main-process verification missing ${item}`);
    }
  }
  if (countOccurrences(source, "CDR_CHAT_INSTALL({getAuthToken:this.options.getChatGptWebviewAuthToken,owner:N})") !== 1) {
    throw new Error(`${relPath(bundlePath)} Chat manager install count is not one`);
  }
}

function platformList(requestedPlatform) {
  const requested = requestedPlatform === "unix"
    ? ["mac-arm64", "mac-x64"]
    : requestedPlatform
      ? [requestedPlatform]
      : ALL_PLATFORMS;
  return requested.filter((platform) =>
    fs.existsSync(path.join(SRC_DIR, platform, "_asar")),
  );
}

function rendererCandidate(platform) {
  const assetsDir = path.join(SRC_DIR, platform, "_asar", "webview", "assets");
  if (!fs.existsSync(assetsDir)) return null;
  const candidates = [];
  for (const filename of fs.readdirSync(assetsDir)) {
    if (!filename.endsWith(".js")) continue;
    const bundlePath = path.join(assetsDir, filename);
    const source = fs.readFileSync(bundlePath, "utf8");
    if (
      source.includes("sidebarElectron.productMode.chatGptWork.plainText") &&
      (source.includes("function XDe(") || source.includes(RENDERER_MARKER)) &&
      (source.includes("function WAe(") || source.includes("function CodexNativeShell("))
    ) {
      candidates.push({ path: bundlePath, source });
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`${platform}: expected one renderer candidate, found ${candidates.length}`);
  }
  return candidates[0];
}

function mainCandidate(platform) {
  const buildDir = path.join(SRC_DIR, platform, "_asar", ".vite", "build");
  if (!fs.existsSync(buildDir)) return null;
  const candidates = [];
  for (const filename of fs.readdirSync(buildDir)) {
    if (!/^main(?:-.*)?\.js$/.test(filename)) continue;
    const bundlePath = path.join(buildDir, filename);
    const source = fs.readFileSync(bundlePath, "utf8");
    if (
      source.includes("Authenticated ChatGPT webview target must be ChatGPT") &&
      (source.includes("function aB(") || source.includes(MAIN_MARKER))
    ) {
      candidates.push({ path: bundlePath, source });
    }
  }
  if (candidates.length !== 1) {
    throw new Error(`${platform}: expected one main-process candidate, found ${candidates.length}`);
  }
  return candidates[0];
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");
  const requestedPlatform = args.find((arg) => [...ALL_PLATFORMS, "unix"].includes(arg));
  const platforms = platformList(requestedPlatform);
  if (platforms.length === 0) {
    console.log("  [skip] No extracted application sources found");
    return;
  }

  let changed = 0;
  for (const platform of platforms) {
    const transactionRoot = path.join(SRC_DIR, platform, "_asar");
    if (recoverAtomicTransaction(transactionRoot)) {
      console.log(`  [${platform}] recovered an interrupted dedicated Chat transaction`);
    }
    const renderer = rendererCandidate(platform);
    const mainBundle = mainCandidate(platform);
    if (renderer == null || mainBundle == null) {
      throw new Error(`${platform}: renderer or main-process bundle is missing`);
    }
    console.log(`  [${platform}] ${relPath(renderer.path)}`);
    console.log(`  [${platform}] ${relPath(mainBundle.path)}`);
    const nextRenderer = patchRenderer(renderer.source, renderer.path);
    const nextMain = patchMain(mainBundle.source, mainBundle.path);

    if (!nextRenderer.changed && !nextMain.changed) {
      console.log("    [ok] already installed and verified");
      continue;
    }
    if (isCheck) {
      console.log("    [?] dedicated Chat mode would be patched");
      continue;
    }
    const entries = [];
    if (nextRenderer.changed) {
      entries.push({
        path: renderer.path,
        previous: renderer.source,
        next: nextRenderer.source,
        verify: verifyRenderer,
      });
    }
    if (nextMain.changed) {
      entries.push({
        path: mainBundle.path,
        previous: mainBundle.source,
        next: nextMain.source,
        verify: verifyMain,
      });
    }
    atomicReplaceEntries(entries, { transactionRoot });
    changed += 1;
    console.log("    [ok] patched renderer + main process and verified");
  }
  console.log(`  [ok] ${isCheck ? "checked" : "patched"} ${platforms.length} platform(s); ${changed} changed`);
}

module.exports = {
  CHAT_PARTITION,
  MAIN_MARKER,
  RENDERER_MARKER,
  atomicReplaceEntries,
  countOccurrences,
  patchMain,
  patchRenderer,
  recoverAtomicTransaction,
  replaceExactly,
  verifyMain,
  verifyRenderer,
};

if (require.main === module) main();
