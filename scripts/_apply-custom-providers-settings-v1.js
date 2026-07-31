#!/usr/bin/env node
"use strict";

// custom-providers-settings-v1 — Add a Custom Models & Providers section to Settings.
//
// Patches THREE bundles:
// 1. use-visible-settings-sections-*.js — register and expose the panel, icon,
//    visibility case, and loading state.
// 2. settings-page-*.js — patch the i18n label string (nn) to include "custom-providers".
// 3. app-initial-*.js (monolith) — add custom-providers to:
//    a) r4l nav message descriptor map (prevents formatMessage(undefined) crash)
//    b) s4l section label switch + bump memo cache from 29→30
//    c) Q3o route registry and L2l lazy panel load map
//
// The panel is a self-contained React component. Non-secret draft metadata is
// cached in localStorage, while Apply writes the real provider configuration
// through Codex's existing config/batchWrite AppServer bridge.

const fs = require("fs");
const path = require("path");
const acorn = require("acorn");

const ROOT = path.join(__dirname, "..");
const ASSETS = path.join(ROOT, "src/mac-x64/_asar/webview/assets");
const MARKER = "codex-rebuild:custom-providers-settings-v1";
const LOADER_MARKER = MARKER + ":loader-export";
const PANEL_EXPORT_MARKER = MARKER + ":panel-v2-export";
const ICON_EXPORT_MARKER = MARKER + ":icon-v2-export";
const SLUG = "custom-providers";
const LS_KEY = "cdr-custom-providers-v1";
const ICON_CODE = "\nfunction CDRCustomProvidersIcon(e){return(0,CDRJsx.jsx)('svg',{width:24,height:24,viewBox:'0 0 24 24',fill:'none',xmlns:'http://www.w3.org/2000/svg',...e,children:(0,CDRJsx.jsx)('path',{d:'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z',fill:'currentColor'})})}\n";

function asset(prefix) {
  const name = fs.readdirSync(ASSETS).find((f) => f.startsWith(prefix) && f.endsWith(".js"));
  if (!name) throw new Error(`missing ${prefix} bundle`);
  return path.join(ASSETS, name);
}

function replaceOne(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1 target, found ${count}`);
  return source.replace(oldValue, newValue);
}

function dependencyTable(source) {
  const start = source.indexOf("const __vite__mapDeps=");
  if (start < 0) throw new Error("26.727 provider: __vite__mapDeps table is missing");
  const arrayStart = source.indexOf("m.f=[", start);
  if (arrayStart < 0) throw new Error("26.727 provider: __vite__mapDeps asset array is missing");
  const open = arrayStart + "m.f=".length;
  let depth = 0;
  let quote = null;
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "`" || char === "\"" || char === "'") { quote = char; continue; }
    if (char === "[") depth += 1;
    else if (char === "]" && --depth === 0) {
      const body = source.slice(open + 1, index);
      const assets = [];
      const pattern = /["']([^"']+\.js)["']/g;
      let match;
      while ((match = pattern.exec(body))) assets.push(match[1]);
      return assets;
    }
  }
  throw new Error("26.727 provider: unterminated __vite__mapDeps asset array");
}

function resolveDependencyIndices(mainSource, chunkSource, mainBundleName) {
  const assets = dependencyTable(mainSource);
  const imports = [];
  const pattern = /(?:from\s*|import\s*(?:\(\s*)?)[`'\"]\.\/([^`'\"]+)[`'\"]/g;
  let match;
  while ((match = pattern.exec(chunkSource))) {
    const asset = `./${match[1]}`;
    if (!imports.includes(asset)) imports.push(asset);
  }
  const indices = [];
  for (const asset of imports) {
    const index = assets.indexOf(asset);
    if (index >= 0 && !indices.includes(index)) indices.push(index);
    else if (asset !== `./${mainBundleName}`) {
      throw new Error(`26.727 provider: Vite dependency is not in __vite__mapDeps: ${asset}`);
    }
  }
  if (!indices.length) throw new Error("26.727 provider: no Vite dependencies resolved");
  return indices;
}

function fileExists(io, file) {
  try { return io.existsSync(file); } catch { return false; }
}

function cleanupTransactionArtifacts(state, io, removeJournal = true) {
  const errors = [];
  for (const entry of state.entries) {
    for (const file of [entry.temp, entry.backup]) {
      if (!file) continue;
      try { io.unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
    }
  }
  if (removeJournal) {
    for (const file of [state.journal, `${state.journal}.tmp`]) {
      try { io.unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
    }
  }
  return errors;
}

function recoverTransaction(state, io = fs) {
  if (state.status === "committed") {
    const errors = cleanupTransactionArtifacts(state, io, false);
    if (!errors.length) {
      try { io.unlinkSync(state.journal); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
      try { io.unlinkSync(`${state.journal}.tmp`); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
    }
    if (errors.length) throw new Error(`custom-provider committed transaction cleanup failed: ${errors[0].message}`);
    return;
  }
  const errors = [];
  for (const entry of state.entries.slice().reverse()) {
    try { if (entry.temp) io.unlinkSync(entry.temp); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
    // Recovery is artifact-driven rather than flag-driven. If a rename
    // succeeded but the following journal update did not, the backup still
    // exists and must be restored.
    if (!entry.backup || !fileExists(io, entry.backup)) continue;
    try {
      if (fileExists(io, entry.file)) io.unlinkSync(entry.file);
      io.renameSync(entry.backup, entry.file);
    } catch (error) { errors.push(error); }
  }
  // Never delete a backup while any restore failed. The journal and remaining
  // backup are the only durable path for the next startup to finish recovery.
  if (errors.length) throw new Error(`custom-provider transaction recovery failed: ${errors[0].message}`);
  for (const entry of state.entries) {
    if (entry.originalExisted !== false && !fileExists(io, entry.file)) {
      errors.push(new Error(`original bundle was not restored: ${entry.file}`));
    }
  }
  if (!errors.length) errors.push(...cleanupTransactionArtifacts(state, io, false));
  if (!errors.length) {
    try { io.unlinkSync(state.journal); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
    try { io.unlinkSync(`${state.journal}.tmp`); } catch (error) { if (error.code !== "ENOENT") errors.push(error); }
  }
  if (errors.length) throw new Error(`custom-provider transaction recovery failed: ${errors[0].message}`);
}

function recoverBundleTransactions(directory, io = fs) {
  const journals = io.readdirSync(directory).filter((name) => /^\.cdr-transaction-.*\.json$/.test(name));
  for (const name of journals) {
    const journal = path.join(directory, name);
    let state;
    try { state = JSON.parse(io.readFileSync(journal, "utf8")); } catch (error) {
      throw new Error(`custom-provider transaction journal is unreadable: ${journal}: ${error.message}`);
    }
    state.journal = journal;
    recoverTransaction(state, io);
  }
}

function writeTransactionJournal(state, io) {
  const temp = `${state.journal}.tmp`;
  io.writeFileSync(temp, JSON.stringify(state), "utf8");
  io.renameSync(temp, state.journal);
}

function commitBundleSet(entries, io = fs) {
  const changed = entries.filter((entry) => entry.next !== entry.previous);
  if (!changed.length) return { cleanupErrors: [] };
  const token = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const journal = path.join(path.dirname(changed[0].file), `.cdr-transaction-${token}.json`);
  const state = {
    version: 1,
    status: "prepared",
    journal,
    entries: changed.map((entry) => ({
      file: entry.file,
      originalExisted: fileExists(io, entry.file),
      temp: `${entry.file}.cdr-staged-${token}`,
      backup: `${entry.file}.cdr-backup-${token}`,
      staged: false,
      backedUp: false,
      installed: false,
    })),
  };
  try {
    writeTransactionJournal(state, io);
    for (const [index, entry] of changed.entries()) {
      io.writeFileSync(state.entries[index].temp, entry.next, "utf8");
      state.entries[index].staged = true;
      writeTransactionJournal(state, io);
    }
    state.status = "committing";
    writeTransactionJournal(state, io);
    for (const entry of state.entries) {
      io.renameSync(entry.file, entry.backup);
      entry.backedUp = true;
      writeTransactionJournal(state, io);
    }
    for (const entry of state.entries) {
      io.renameSync(entry.temp, entry.file);
      entry.installed = true;
      writeTransactionJournal(state, io);
    }
    // Persist the commit marker before changing the in-memory state. If this
    // final journal write fails, the transaction is still only committing and
    // the catch path must restore the original files rather than treating the
    // patched files as an already-committed transaction.
    writeTransactionJournal({ ...state, status: "committed" }, io);
    state.status = "committed";
    const cleanupErrors = cleanupTransactionArtifacts(state, io, false);
    if (!cleanupErrors.length) {
      for (const file of [state.journal, `${state.journal}.tmp`]) {
        try { io.unlinkSync(file); } catch (error) { if (error.code !== "ENOENT") cleanupErrors.push(error); }
      }
    }
    if (cleanupErrors.length) {
      console.warn(`[custom-providers] committed transaction cleanup deferred: ${cleanupErrors[0].message}`);
    }
    return { cleanupErrors };
  } catch (error) {
    try { recoverTransaction(state, io); } catch (rollbackError) {
      error.message += `; rollback failed: ${rollbackError.message}`;
      error.rollbackError = rollbackError;
    }
    throw error;
  }
}

function stripOldPanelCode(source) {
  // Remove any version of the panel code by finding the marker range.
  // The old inline-style code won't match the current PANEL_CODE const,
  // so we remove it by finding the text between the marker and the next
  // function (CDRCustomProvidersPanelV2Skeleton) or export.
  // Also handles leftover 'const CDRJsx=a();' / 'const CDRReact=CDRInterop' lines
  // from multiple previous injection iterations.
  const markerStart = '/* ' + PANEL_EXPORT_MARKER + ' */';
  const startIdx = source.indexOf(markerStart);
  if (startIdx < 0) return source;
  // Find the start — go back to find 'function CDRCustomProvidersPanelV2('
  const funcStart = source.lastIndexOf('CDRCustomProvidersPanelV2', startIdx);
  if (funcStart < 0) return source;
  // Walk backwards past any leftover CDR variable declarations (multiple layers)
  let removeStart = Math.max(0, source.lastIndexOf('\n', funcStart));
  let maxIter = 10; // safety limit
  while (maxIter-- > 0) {
    const beforeLines = source.slice(Math.max(0, removeStart - 100), removeStart).trim();
    if (beforeLines.includes('CDRJsx') || beforeLines.includes('CDRReact') || beforeLines.includes('CDRInterop')) {
      removeStart = Math.max(0, source.lastIndexOf('\n', removeStart - 1));
    } else {
      break;
    }
  }
  // Find the end — next function or export
  const markers = ['function CDRCustomProvidersPanelV2Skeleton', '\nexport{', '\n//# sourceMappingURL='];
  let removeEnd = source.length;
  for (const m of markers) {
    const idx = source.indexOf(m, startIdx);
    if (idx >= 0 && idx < removeEnd) removeEnd = idx;
  }
  return source.slice(0, removeStart) + '\n' + source.slice(removeEnd);
}

function stripOldIconCode(source) {
  const markerStart = '/* ' + ICON_EXPORT_MARKER + ' */';
  const startIdx = source.indexOf(markerStart);
  if (startIdx < 0) return source;
  const funcStart = source.lastIndexOf('CDRCustomProvidersIconV2', startIdx);
  if (funcStart < 0) return source;
  const removeStart = Math.max(0, source.lastIndexOf('\n', funcStart));
  const markers = ['function CDRCustomProvidersPanelV2Skeleton', '\nexport{', '\n//# sourceMappingURL='];
  let removeEnd = source.length;
  for (const m of markers) {
    const idx = source.indexOf(m, startIdx);
    if (idx >= 0 && idx < removeEnd) removeEnd = idx;
  }
  return source.slice(0, removeStart) + '\n' + source.slice(removeEnd);
}

function cleanExportEntries(source) {
  // Strips ALL duplicate CDRCustomProvidersPanelV2 entries from the export
  // statement, leaving only the non-panel exports. The fresh entry is added
  // by ensurePanelLoaderExport afterward.
  const expStart = source.indexOf('export{');
  if (expStart < 0) return source;
  const expEnd = source.indexOf('}', expStart);
  if (expEnd < 0) return source;
  const exportBody = source.slice(expStart + 7, expEnd);
  // Split entries, filter out any that reference CDRCustomProvidersPanelV2
  const entries = exportBody.split(',').map(e => e.trim()).filter(e => e);
  const cleanEntries = entries.filter(e => !e.includes('CDRCustomProvidersPanelV2'));
  if (cleanEntries.length === entries.length) return source; // no duplicates to clean
  const newExport = 'export{' + cleanEntries.join(',') + '}';
  return source.slice(0, expStart) + newExport + source.slice(expEnd + 1);
}

function ensurePanelLoaderExport(source) {
  // Strip ANY old panel/icon code by marker range (handles version mismatches)
  source = stripOldPanelCode(source);
  source = stripOldIconCode(source);
  source = source.replace("\ntry{window.__CDRCustomProvidersPanel=CDRCustomProvidersPanel}catch{}\n", "");
  source = source.replace(
    '"custom-providers":CDRCustomProvidersIcon,',
    '"custom-providers":CDRCustomProvidersIconV2,',
  );
  // Nvt is the app's React module initializer. The minified `s` binding is a
  // different initializer entirely; treating it as React only fails once the
  // settings panel actually renders. Import the runtime interop helper and
  // materialize a stable React namespace at module scope.
  if (!source.includes("s as CDRInterop")) {
    source = replaceOne(
      source,
      'import{n as e}from"./rolldown-runtime-',
      'import{n as e,s as CDRInterop}from"./rolldown-runtime-',
      "custom providers React interop import",
    );
  }
  // Clean export of any stale duplicate CDRCustomProvidersPanelV2 entries
  source = cleanExportEntries(source);
  // Always inject fresh panel and icon code
  const newPanelCode = PANEL_CODE.replace(
    `function CDRCustomProvidersPanel(){/* ${MARKER}:panel */`,
    `function CDRCustomProvidersPanelV2(){/* ${PANEL_EXPORT_MARKER} */`,
  );
  const newIconCode = ICON_CODE.replace(
    "function CDRCustomProvidersIcon(e){",
    `function CDRCustomProvidersIconV2(e){/* ${ICON_EXPORT_MARKER} */`,
  );
  const definitions = newPanelCode + '\n' + newIconCode;
  return replaceOne(
    source,
    "export{",
    definitions + "\nexport{CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2,",
    "export module-scoped custom providers panel and icon",
  );
}

// ─── The React component injected into the settings page ───
// Styled with Tailwind CSS classes matching the native settings panel conventions.
// Uses the app's theme CSS variables via native classes (text-token-*, heading-lg, etc.).
// Provider data is cached in localStorage. Apply writes config via the batchWrite bridge.
const PANEL_CODE = `
const CDRJsx=a();
const CDRReact=CDRInterop(y(),1);
function CDRCustomProvidersPanel(){/* ${MARKER}:panel */
let [providers,setProviders]=CDRReact.useState([]);
let [editing,setEditing]=CDRReact.useState(null);
let [showToml,setShowToml]=CDRReact.useState(!1);
let [copied,setCopied]=CDRReact.useState(!1);
let [removed,setRemoved]=CDRReact.useState([]);
let [renamed,setRenamed]=CDRReact.useState({});
let [credentialCleared,setCredentialCleared]=CDRReact.useState({});
let [status,setStatus]=CDRReact.useState('');
let [saving,setSaving]=CDRReact.useState(!1);
let providerId=()=>{try{if(globalThis.crypto&&typeof globalThis.crypto.randomUUID==='function')return'prov-'+globalThis.crypto.randomUUID()}catch{}return'prov-'+Date.now()+'-'+Math.random().toString(36).slice(2,8)};
let trim=v=>String(v==null?'':v).trim();
let validName=p=>/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trim(p.name))&&!['openai','ollama','lmstudio'].includes(trim(p.name).toLowerCase());
let validEnvKey=p=>!trim(p.env_key)||/^[A-Z_][A-Z0-9_]{0,127}$/.test(trim(p.env_key).toUpperCase());
let statusError=s=>/^(Save failed|Provider|This provider|Copy failed|.* needs an HTTPS|.* has an invalid environment)/.test(String(s||''));
let fieldId=(p,field)=>'cdr-provider-'+p.id+'-'+field;
let validBaseUrl=p=>{let raw=trim(p.base_url);if(!raw)return!1;try{let u=new URL(raw);if(u.username||u.password)return!1;if(u.protocol==='https:')return!0;if(u.protocol!=='http:')return!1;let h=u.hostname.toLowerCase();return h==='localhost'||h==='127.0.0.1'||h==='[::1]'||h==='::1'}catch{return!1}};
let providerError=p=>{let name=trim(p.name)||'This provider';if(!validName(p))return'Provider ID must start with a letter or number, use only letters, numbers, _ or -, and cannot be a built-in provider.';if(!validBaseUrl(p))return name+' needs an HTTPS base URL (HTTP is allowed only for localhost).';if(!validEnvKey(p))return name+' has an invalid environment variable name.';return''};
let normalizeProvider=p=>({id:trim(p.id)||providerId(),name:trim(p.name),display_name:trim(p.display_name),base_url:trim(p.base_url),api_key:String(p.api_key||''),model:trim(p.model),env_key:trim(p.env_key).toUpperCase(),active:!!p.active});
let save=(next)=>{let normalized=next.map(normalizeProvider);setProviders(normalized);try{localStorage.setItem('${LS_KEY}',JSON.stringify(normalized.map(({api_key,...p})=>p)))}catch{}};
let loadDraft=()=>{try{let d=JSON.parse(localStorage.getItem('${LS_KEY}')||'[]');if(Array.isArray(d))return d.map(normalizeProvider)}catch{}return[]};
CDRReact.useEffect(()=>{setProviders(loadDraft())},[]);
let addProvider=()=>{let p=normalizeProvider({id:providerId(),active:providers.length===0});let next=[...providers,p];save(next);setEditing(p.id)};
let updateProvider=(id,field,val)=>{let next=providers.map(p=>{if(p.id!==id)return p;let updated={...p,[field]:val};if(field==='name'&&trim(p.name)&&trim(val)!==trim(p.name))setRenamed(v=>({...v,[id]:[...(v[id]||[]),trim(p.name)]}));if(field==='api_key'&&trim(val))updated.env_key='';if(field==='env_key'&&trim(val))updated.api_key='';return updated});save(next);if((field==='api_key'&&trim(val))||(field==='env_key'&&trim(val)))setCredentialCleared(v=>({...v,[id]:!1}))};
let clearCredential=(id)=>{setCredentialCleared(v=>({...v,[id]:!0}));let next=providers.map(p=>p.id===id?{...p,api_key:'',env_key:''}:p);save(next)};
let deleteProvider=(id)=>{let old=providers.find(p=>p.id===id);if(!old)return;if(typeof window!=='undefined'&&typeof window.confirm==='function'&&!window.confirm('Remove '+(old.display_name||old.name||'this provider')+' from Codex?'))return;let oldNames=[...(renamed[id]||[]),trim(old?.name)].filter(Boolean);if(oldNames.length)setRemoved(v=>[...new Set([...v,...oldNames])]);let next=providers.filter(p=>p.id!==id);save(next);setRenamed(v=>{let copy={...v};delete copy[id];return copy});setCredentialCleared(v=>{let copy={...v};delete copy[id];return copy});if(editing===id)setEditing(null)};
let applyPreset=(preset)=>{let p=normalizeProvider({...preset,id:providerId(),api_key:'',model:'',active:providers.length===0});let next=[...providers,p];save(next);setEditing(p.id)};
let validateDrafts=()=>{let clean=providers.map(normalizeProvider);let errors=[];let seen=new Set();for(let p of clean){let error=providerError(p);if(error)errors.push(error);let key=trim(p.name).toLowerCase();if(key&&seen.has(key))errors.push('Provider IDs must be unique.');else if(key)seen.add(key)}return{clean,errors}};
let tomlString=v=>JSON.stringify(String(v==null?'':v));
let genToml=()=>{let lines=[];for(let p of providers.map(normalizeProvider)){if(providerError(p))continue;lines.push('[model_providers.'+p.name+']');lines.push('name = '+tomlString(p.display_name||p.name));lines.push('base_url = '+tomlString(p.base_url));if(p.env_key)lines.push('env_key = '+tomlString(p.env_key));else if(p.api_key)lines.push('experimental_bearer_token = "<redacted>"');lines.push('wire_api = "responses"');lines.push('')}let m=providers.map(normalizeProvider).find(p=>p.active&&p.model&&!providerError(p));if(m){lines.push('model = '+tomlString(m.model));lines.push('model_provider = '+tomlString(m.name));lines.push('')}return lines.join('\\n')};
let applyConfig=async()=>{if(saving)return;let validation=validateDrafts();if(validation.errors.length){setStatus(validation.errors[0]);return}let clean=validation.clean;if(!clean.length&&removed.length===0){setStatus('Add a provider first.');return}let renamedNames=Object.values(renamed).flat();let namesToRemove=[...new Set([...removed.map(trim),...renamedNames.map(trim)].filter(Boolean))];let currentNames=new Set(clean.map(p=>trim(p.name)));let edits=[];for(let name of namesToRemove)if(!currentNames.has(name))edits.push({keyPath:'model_providers.'+name,value:null,mergeStrategy:'replace'});for(let p of clean){let providerPath='model_providers.'+p.name;let value={name:p.display_name||p.name,base_url:p.base_url,wire_api:'responses'};if(p.env_key)value.env_key=p.env_key;else if(p.api_key)value.experimental_bearer_token=p.api_key;edits.push({keyPath:providerPath,value,mergeStrategy:'upsert'});if(credentialCleared[p.id]){edits.push({keyPath:providerPath+'.experimental_bearer_token',value:null,mergeStrategy:'replace'},{keyPath:providerPath+'.env_key',value:null,mergeStrategy:'replace'})}else if(p.env_key){edits.push({keyPath:providerPath+'.experimental_bearer_token',value:null,mergeStrategy:'replace'})}else if(p.api_key){edits.push({keyPath:providerPath+'.env_key',value:null,mergeStrategy:'replace'})}}let active=clean.find(p=>p.active&&p.model);if(active){edits.push({keyPath:'model_provider',value:active.name,mergeStrategy:'upsert'},{keyPath:'model',value:active.model,mergeStrategy:'upsert'})}setSaving(!0);setStatus('Saving to Codex config…');try{let write=globalThis.__cdrWriteConfigEdits;if(typeof write!=='function')throw Error('Codex config bridge is unavailable');await write(edits);setRemoved([]);setRenamed({});setCredentialCleared({});save(clean);setStatus('Saved. Existing credentials are preserved unless you replace or clear them.')}catch(err){setStatus('Save failed: '+String(err&&err.message||err))}finally{setSaving(!1)}};
let copyToml=()=>{try{let text=genToml();if(!text)throw Error('No valid provider configuration to copy');navigator.clipboard.writeText(text);setCopied(!0);setTimeout(()=>setCopied(!1),2e3)}catch(err){setStatus('Copy failed: '+String(err&&err.message||err))}};
let presets=[{name:'openrouter',display_name:'OpenRouter',base_url:'https://openrouter.ai/api/v1',env_key:'OPENROUTER_API_KEY',label:'OpenRouter'}];
// Native-matching Tailwind component helpers
let el=(tag,props,...kids)=>{let p={...props};if(kids.length===1)p.children=kids[0];else if(kids.length>1)p.children=kids;return(0,CDRJsx.jsx)(tag,p)};
let Input=(p)=>el('input',{className:'h-9 w-full rounded-md border border-token-border bg-token-input-background px-3 text-sm text-token-foreground placeholder:text-token-text-tertiary outline-none transition-colors focus:border-token-focus-border focus:ring-2 focus:ring-[var(--color-token-focus-border)]',...p});
let Label=(p)=>el('label',{className:'mb-1.5 mt-4 block text-xs font-medium text-token-text-secondary',...p});
let Btn=(p)=>el('button',{className:'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md border border-token-border bg-transparent px-3 py-1.5 text-sm text-token-foreground transition-colors hover:bg-token-list-hover-background focus:outline-none focus:ring-2 focus:ring-[var(--color-token-focus-border)] disabled:cursor-not-allowed disabled:opacity-40',...p});
let PrimaryBtn=(p)=>el('button',{className:'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--token-main)] px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-[var(--color-token-focus-border)] disabled:cursor-not-allowed disabled:opacity-40',...p});
let DangerBtn=(p)=>el('button',{className:'inline-flex cursor-pointer items-center justify-center gap-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-token-text-secondary transition-colors hover:border-red-500/20 hover:bg-red-500/10 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-red-500/40 disabled:cursor-not-allowed disabled:opacity-40',...p});
let SectionTitle=(p)=>el('h3',{className:'text-sm font-medium text-token-foreground',...p});
let MutedText=(p)=>el('p',{className:'mt-1 text-xs text-token-text-secondary',...p});
return el('div',{className:'flex flex-col gap-6',['data-cdr-custom-providers']:!0},
  // Section header — matches native heading-lg without font-weight override
  el('div',{className:'flex flex-col gap-1'},
    el('h2',{className:'heading-lg text-token-foreground'},'Custom Models & Providers'),
    el('p',{className:'text-sm text-token-text-secondary'},'Add Responses API-compatible providers and save them directly to Codex config.')
  ),
  // Presets use native settings rows rather than dashboard-style pills.
  el('div',{className:'flex flex-col gap-2'},
    el('div',{className:'flex flex-col gap-0.5'},
      el('h3',{className:'text-sm font-medium text-token-foreground'},'Start with a preset'),
      el('p',{className:'text-xs text-token-text-secondary'},'Use an environment variable when possible. You can edit every value before saving.')
    ),
    el('div',{className:'divide-y divide-token-border-light overflow-hidden rounded-lg border border-token-border'},
      ...presets.map(p=>el('button',{key:p.name,onClick:()=>applyPreset(p),className:'flex w-full items-center justify-between gap-4 px-3.5 py-3 text-left transition-colors hover:bg-token-list-hover-background focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--color-token-focus-border)]'},
        el('span',{className:'flex min-w-0 flex-col gap-0.5'},
          el('span',{className:'text-sm font-medium text-token-foreground'},p.label),
          el('span',{className:'truncate text-xs text-token-text-secondary'},p.base_url)
        ),
        el('span',{className:'text-xs text-token-text-secondary'},'Add')
      ))
    )
  ),
  // Provider list
  el('div',{className:'flex flex-col gap-2'},
    el('div',{className:'flex items-center justify-between gap-3'},
      el('div',{className:'flex flex-col gap-0.5'},
        el('h3',{className:'text-sm font-medium text-token-foreground'},'Configured providers'),
        el('p',{className:'text-xs text-token-text-secondary'},providers.length?providers.length+' provider'+(providers.length===1?'':'s'):'Nothing configured yet')
      ),
      el(Btn,{onClick:addProvider},'+ Add provider')
    ),
    ...providers.length===0?[el('div',{key:'empty',className:'rounded-lg border border-dashed border-token-border px-4 py-8 text-center'},
      el('p',{className:'text-sm text-token-text-secondary'},'No providers added yet.'),
      el('p',{className:'mt-1 text-xs text-token-text-tertiary'},'Choose a preset above or add a provider manually.')
    )]:[],
    ...providers.map(p=>el('div',{key:p.id,className:'overflow-hidden rounded-lg border border-token-border transition-colors '+(editing===p.id?'border-token-focus-border':'') ,'data-cdr-provider-row':p.id},
      el('div',{className:'flex items-start justify-between gap-3 px-3.5 py-3 transition-colors hover:bg-token-list-hover-background'},
        el('div',{className:'flex min-w-0 flex-1 flex-col'},
          el(SectionTitle,{},p.display_name||p.name||'(unnamed)'),
          el(MutedText,{},'URL: '+(p.base_url||'—')+(p.active?'  \u2022  Active':'')+(p.model?'  \u2022  Model: '+p.model:''))
        ),
        el('div',{className:'flex shrink-0 items-center gap-1'},
          el(Btn,{onClick:()=>setEditing(editing===p.id?null:p.id),className:'px-2.5 py-1 text-xs'},editing===p.id?'Done':'Edit'),
          el(DangerBtn,{onClick:()=>deleteProvider(p.id),'aria-label':'Delete '+(p.display_name||p.name||'provider')},'Delete')
        )
      ),
      editing===p.id?el('div',{className:'border-t border-token-border bg-token-list-hover-background/30 px-3.5 pb-4 pt-1'},
        el(Label,{htmlFor:fieldId(p,'name')},'Provider ID'),
        el(Input,{id:fieldId(p,'name'),value:p.name,onChange:e=>updateProvider(p.id,'name',e.target.value),placeholder:'openrouter'}),
        el(Label,{htmlFor:fieldId(p,'display')},'Display name'),
        el(Input,{id:fieldId(p,'display'),value:p.display_name||'',onChange:e=>updateProvider(p.id,'display_name',e.target.value),placeholder:'OpenRouter'}),
        el(Label,{htmlFor:fieldId(p,'base-url')},'Base URL'),
        el(Input,{id:fieldId(p,'base-url'),value:p.base_url,onChange:e=>updateProvider(p.id,'base_url',e.target.value),placeholder:'https://openrouter.ai/api/v1'}),
        el(Label,{htmlFor:fieldId(p,'token')},'Bearer token (optional; env var recommended)'),
        el(Input,{id:fieldId(p,'token'),type:'password',value:p.api_key,onChange:e=>updateProvider(p.id,'api_key',e.target.value),placeholder:'sk-...',autoComplete:'new-password','aria-label':'Bearer token'}),
        el(Label,{htmlFor:fieldId(p,'env')},'Environment variable name'),
        el(Input,{id:fieldId(p,'env'),value:p.env_key,onChange:e=>updateProvider(p.id,'env_key',e.target.value),placeholder:'OPENROUTER_API_KEY','aria-label':'Environment variable name'}),
        el(Btn,{onClick:()=>clearCredential(p.id),disabled:!!credentialCleared[p.id]},credentialCleared[p.id]?'Credential will be cleared':'Clear saved credential'),
        el(Label,{htmlFor:fieldId(p,'model')},'Default model'),
        el(Input,{id:fieldId(p,'model'),value:p.model,onChange:e=>updateProvider(p.id,'model',e.target.value),placeholder:'provider/model-name'}),
        providerError(p)?el('p',{role:'alert',className:'mt-3 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-500'},providerError(p)):null,
        el('label',{className:'mt-4 flex cursor-pointer items-center gap-2.5'},
          el('input',{type:'checkbox',checked:!!p.active,onChange:e=>{let next=providers.map(x=>({...x,active:x.id===p.id?e.target.checked:!1}));save(next)},className:'h-4 w-4 rounded border-token-border text-[var(--token-main)] focus:ring-[var(--token-main)]'}),
          el('span',{className:'text-sm text-token-foreground'},'Make this the active provider')
        )
      ):null
    ))
  ),
  // Action buttons
  el('div',{className:'flex flex-wrap items-center gap-2 border-t border-token-border-light pt-4'},
    el(PrimaryBtn,{onClick:applyConfig,disabled:saving},saving?'Saving\u2026':'Save changes'),
    el(Btn,{onClick:()=>setShowToml(!showToml),disabled:providers.length===0},showToml?'Hide preview':'Preview TOML')
  ),
  // Status message
  status?el('div',{role:'status','aria-live':'polite',className:'rounded-md px-3 py-2 text-xs '+(statusError(status)?'bg-red-500/10 text-red-500':'bg-token-list-hover-background text-token-text-secondary')},status):null,
  // TOML output
  showToml&&providers.length>0?el('div',{className:'overflow-hidden rounded-lg border border-token-border bg-token-main-surface-primary',['data-toml']:!0},
    el('div',{className:'flex items-center justify-between gap-2 border-b border-token-border-light px-3.5 py-2.5'},
      el('div',{className:'flex flex-col gap-0.5'},
        el('span',{className:'text-xs font-medium text-token-foreground'},'TOML preview'),
        el('span',{className:'text-[11px] text-token-text-secondary'},'Credentials are redacted in this preview.')
      ),
      el(Btn,{onClick:copyToml,className:'px-2.5 py-1 text-xs'},copied?'Copied':'Copy')
    ),
    el('pre',{className:'max-h-80 overflow-auto whitespace-pre-wrap break-all px-3.5 py-3 font-mono text-xs leading-relaxed text-token-text-secondary'},genToml())
  ):null,
  // Footer note
  el(MutedText,{className:'mt-1',role:'note'},'Remote providers must use HTTPS. Environment variables are recommended; direct bearer tokens are never cached in localStorage.')
)}
`;

// ─── Patch use-visible-settings-sections ───
function patchSectionsBundle(source) {
  const currentPanelSignature = [
    `/* ${PANEL_EXPORT_MARKER} */`,
    `/* ${ICON_EXPORT_MARKER} */`,
    "let [credentialCleared,setCredentialCleared]",
    "Clear saved credential",
    "Provider IDs must be unique.",
    "data-cdr-provider-row",
    "Start with a preset",
    "htmlFor:fieldId",
    "window.confirm",
    "s as CDRInterop",
  ];
  if (source.includes(MARKER + ":applied") && currentPanelSignature.every((signature) => source.includes(signature))) {
    return source;
  }
  if (source.includes(MARKER + ":applied")) return ensurePanelLoaderExport(source);

  // 1. 26.727 keeps the visible-settings list in Q and the section icon map
  //    in Z. Both are module-scope structures, so these anchors are stable
  //    without relying on the old 26.721 minified variable names.
  const qOld = "Q=[`profile`,`agent`,`personalization`,`mcp-settings`,`plugins-settings`,`hooks-settings`,`local-environments`,`worktrees`,`data-controls`]";
  const qNew = "Q=[`profile`,`agent`,`personalization`,`mcp-settings`,`plugins-settings`,`hooks-settings`,`local-environments`,`worktrees`,`data-controls`,`" + SLUG + "`]";
  if (source.includes(qOld)) {
    source = replaceOne(source, qOld, qNew, "add custom-providers to visible settings list");
  } else if (!source.includes("Q=[") || !source.includes("`custom-providers`")) {
    throw new Error("26.727 visible settings list anchor not found");
  }

  const iconAnchor = "Z={\"general-settings\":c,";
  if (source.includes(iconAnchor)) {
    source = replaceOne(
      source,
      iconAnchor,
      "Z={\"custom-providers\":CDRCustomProvidersIconV2,\"general-settings\":c,",
      "add custom-providers icon to 26.727 section map",
    );
  } else if (!source.includes('"custom-providers":CDRCustomProvidersIconV2')) {
    throw new Error("26.727 settings icon map anchor not found");
  }

  source = replaceOne(
    source,
    "case`data-controls`:return!0;",
    "case`data-controls`:case`custom-providers`:return!0;",
    "make custom-providers visible",
  );
  source = replaceOne(
    source,
    "case`appearance`:case`pets`:case`general-settings`:case`agent`:case`git-settings`:case`data-controls`:case`code-review`:case`cloud-settings`:case`cloud-environments`:case`personalization`:V=!1;",
    "case`appearance`:case`pets`:case`general-settings`:case`agent`:case`git-settings`:case`data-controls`:case`custom-providers`:case`code-review`:case`cloud-settings`:case`cloud-environments`:case`personalization`:V=!1;",
    "make custom-providers immediately renderable",
  );

  // 3. Parse-check
  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error("parse failed after sections patch: " + e.message);
  }

  source = ensurePanelLoaderExport(source);
  source += "\n/* " + MARKER + ":applied */\n";
  return source;
}

// ─── Patch app-initial monolith: add custom-providers to r4l nav message map + s4l switch ───
function patchMonolith(source, sectionsModuleName, dependencyIndices) {
  if (dependencyIndices == null) throw new Error("modern provider patch requires resolved Vite dependency indices");
  const dependencyList = Array.isArray(dependencyIndices) ? dependencyIndices : String(dependencyIndices).split(",").map((value) => Number(value.trim())).filter(Number.isInteger);
  if (!dependencyList.length || dependencyList.some((value) => value < 0)) throw new Error("invalid Vite dependency indices for custom-provider loader");
  const MODERN_MARKER = MARKER + ":26727";
  const modernRouteMarker = MODERN_MARKER + ":gls";
  const modernLoaderMarker = MODERN_MARKER + ":KJ";
  const modernSectionMarker = MODERN_MARKER + ":Yyu";
  if (source.includes(MODERN_MARKER)) {
    if (!source.includes("function Yyu(e){") || !source.includes("return rp(`batch-write-config-value`")) {
      throw new Error("modern custom-provider patch is missing its section-label or config-bridge anchor");
    }
    for (const needle of [
      modernRouteMarker,
      modernLoaderMarker,
      modernSectionMarker,
      MARKER + ":config-bridge",
      'fls=`general-settings',
      'gls=[{slug:`general-settings`',
      '"custom-providers":KJ(',
      'case`custom-providers`:',
    ]) {
      if (!source.includes(needle)) throw new Error(`modern custom-provider patch is incomplete: ${needle}`);
    }
    return source;
  }
  // 26.727 moved settings registration to the module-scope fls/gls lists,
  // the KJ Vite loader map, and Yyu's memoized section-label switch. Keep
  // this port separate from the retired r4l/s4l/Q3o/L2l implementation so a
  // clean modern bundle can never pass by appending legacy markers only.
  if (source.includes('fls=`general-settings') && source.includes('gls=[{slug:`general-settings`') && source.includes('"data-controls":KJ(')) {
    if (!sectionsModuleName) throw new Error("settings sections module name is required");
    if (!source.includes('function rp(e,t){return J6e.sendRequest(e,t)}')) {
      throw new Error("26.727 AppServer request dispatcher rp is not resolvable");
    }
    const bridgeAnchor = 'function Yyu(e){let t=(0,Xyu.c)(29),';
    const bridgeCode = "globalThis.__cdrWriteConfigEdits=edits=>{let providerPath=/^model_providers\\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;let credentialPath=/^model_providers\\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}\\.(?:experimental_bearer_token|env_key)$/;let validEnv=v=>!v||/^[A-Z_][A-Z0-9_]{0,127}$/.test(v);let validUrl=v=>{try{let u=new URL(v);let h=u.hostname.toLowerCase();return!u.username&&!u.password&&(u.protocol===`https:`||(u.protocol===`http:`&&[`localhost`,`127.0.0.1`,`[::1]`,`::1`].includes(h)))}catch{return!1}};let valid=e=>{if(!e||typeof e.keyPath!==`string`||!(`model`===e.keyPath||`model_provider`===e.keyPath||providerPath.test(e.keyPath)||credentialPath.test(e.keyPath)))return!1;if(!(`replace`===e.mergeStrategy||`upsert`===e.mergeStrategy))return!1;if(`model`===e.keyPath||`model_provider`===e.keyPath)return typeof e.value===`string`&&e.value.length>0;if(credentialPath.test(e.keyPath))return e.value===null||(e.keyPath.endsWith(`.env_key`)?typeof e.value===`string`&&validEnv(e.value):typeof e.value===`string`);if(!e.value||typeof e.value!==`object`||Array.isArray(e.value))return!1;let keys=Object.keys(e.value);if(!keys.includes(`name`)||!keys.includes(`base_url`)||!keys.includes(`wire_api`))return!1;if(keys.includes(`env_key`)&&keys.includes(`experimental_bearer_token`))return!1;if(e.value.wire_api!==`responses`||typeof e.value.name!==`string`||!e.value.name||typeof e.value.base_url!==`string`||!validUrl(e.value.base_url)||(`env_key`in e.value&&!validEnv(e.value.env_key)))return!1;return keys.every(k=>[`name`,`base_url`,`wire_api`,`env_key`,`experimental_bearer_token`].includes(k))&&keys.every(k=>typeof e.value[k]===`string`)};if(!Array.isArray(edits)||edits.length>64||edits.some(e=>!valid(e)))throw Error(`Invalid custom provider config edits`);return rp(`batch-write-config-value`,{hostId:`local`,edits,filePath:null,expectedVersion:null,reloadUserConfig:!0})};/* " + MARKER + ":config-bridge */";
    source = replaceOne(source, bridgeAnchor, bridgeCode + bridgeAnchor, "install modern custom-provider config bridge");
    source = replaceOne(source, 'skills-settings`.split(`.`)', 'skills-settings.custom-providers`.split(`.`)', "add custom-providers to fls visibility list");
    source = replaceOne(source, '{slug:`data-controls`}]', '{slug:`data-controls`},{slug:`custom-providers`}]/* ' + modernRouteMarker + ' */', "add custom-providers to gls route list");
    const dependencyText = dependencyList.join(",");
    const loader = '"custom-providers":KJ(async()=>(await eu(async()=>{let{CDRCustomProvidersPanelV2:e}=await import(`./' + sectionsModuleName + '`);return{CDRCustomProvidersPanelV2:e}},__vite__mapDeps([' + dependencyText + ']),import.meta.url)).CDRCustomProvidersPanelV2)/* ' + modernLoaderMarker + ' */,';
    source = replaceOne(source, '"skills-settings":KJ(', loader + '"skills-settings":KJ(', "add custom-providers to KJ loader map");
    const ast = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
    const yyuNode = ast.body.find((node) => node.type === "FunctionDeclaration" && node.id?.name === "Yyu");
    if (!yyuNode) throw new Error("26.727 Yyu section-label switch not found");
    let yyu = source.slice(yyuNode.start, yyuNode.end);
    yyu = replaceOne(yyu, 'function Yyu(e){let t=(0,Xyu.c)(29),', 'function Yyu(e){let t=(0,Xyu.c)(30),', "bump Yyu memo cache to 30");
    if (!yyu.endsWith('e}}}')) throw new Error("Yyu switch tail changed; refusing non-atomic section-label patch");
    yyu = yyu.slice(0, -3) + 'e}case`custom-providers`:{let e;return t[29]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,w7.jsx)(Z,{id:`settings.section.custom-providers`,defaultMessage:`Custom Providers`,description:`Title for custom models and providers settings section`}),t[29]=e):e=t[29],e}' + '}}';
    source = source.slice(0, yyuNode.start) + yyu + source.slice(yyuNode.end);
    source += "\n/* " + modernSectionMarker + " */\n/* " + MODERN_MARKER + " */\n";
    try { acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" }); } catch (error) { throw new Error("parse failed after modern monolith patch: " + error.message); }
    return source;
  }
  const R4L_MARKER = MARKER + ":r4l";
  if (source.includes(R4L_MARKER)) {
    if (!source.includes(MARKER + ":config-bridge")) {
      throw new Error("custom providers nav exists but config bridge is missing");
    }
    if (!sectionsModuleName) throw new Error("settings sections module name is required");
    const oldLoader = '"custom-providers":JY(async()=>{await import(`./' + sectionsModuleName + '`);let panel=window.__CDRCustomProvidersPanel;if(typeof panel!==`function`)throw new Error(`Custom Providers panel failed to initialize`);return panel})';
    const intermediateLoader = '"custom-providers":JY(async()=>{let module=await import(`./' + sectionsModuleName + '`);return module.CDRLoadCustomProvidersPanel()})';
    const newLoader = '"custom-providers":JY(async()=>{let module=await import(`./' + sectionsModuleName + '`);let panel=module.CDRCustomProvidersPanelV2;if(typeof panel!==`function`)throw new Error(`Custom Providers module export is unavailable`);return panel})';
    if (source.includes(oldLoader)) source = replaceOne(source, oldLoader, newLoader, "upgrade custom providers initialized loader");
    if (source.includes(intermediateLoader)) source = replaceOne(source, intermediateLoader, newLoader, "upgrade custom providers module loader");
    const safeBridge = "globalThis.__cdrWriteConfigEdits=edits=>{let providerPath=/^model_providers\\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;let credentialPath=/^model_providers\\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}\\.(?:experimental_bearer_token|env_key)$/;let validEnv=v=>!v||/^[A-Z_][A-Z0-9_]{0,127}$/.test(v);let validUrl=v=>{try{let u=new URL(v);let h=u.hostname.toLowerCase();return!u.username&&!u.password&&(u.protocol===`https:`||(u.protocol===`http:`&&[`localhost`,`127.0.0.1`,`[::1]`,`::1`].includes(h)))}catch{return!1}};let valid=e=>{if(!e||typeof e.keyPath!==`string`||!(`model`===e.keyPath||`model_provider`===e.keyPath||providerPath.test(e.keyPath)||credentialPath.test(e.keyPath)))return!1;if(!(`replace`===e.mergeStrategy||`upsert`===e.mergeStrategy))return!1;if(`model`===e.keyPath||`model_provider`===e.keyPath)return typeof e.value===`string`&&e.value.length>0;if(credentialPath.test(e.keyPath))return e.value===null||(e.keyPath.endsWith(`.env_key`)?typeof e.value===`string`&&validEnv(e.value):typeof e.value===`string`);if(!e.value||typeof e.value!==`object`||Array.isArray(e.value))return!1;let keys=Object.keys(e.value);if(!keys.includes(`name`)||!keys.includes(`base_url`)||!keys.includes(`wire_api`))return!1;if(keys.includes(`env_key`)&&keys.includes(`experimental_bearer_token`))return!1;if(e.value.wire_api!==`responses`||typeof e.value.name!==`string`||!e.value.name||typeof e.value.base_url!==`string`||!validUrl(e.value.base_url)||(`env_key`in e.value&&!validEnv(e.value.env_key)))return!1;return keys.every(k=>[`name`,`base_url`,`wire_api`,`env_key`,`experimental_bearer_token`].includes(k))&&keys.every(k=>typeof e.value[k]===`string`)};if(!Array.isArray(edits)||edits.length>64||edits.some(e=>!valid(e)))throw Error(`Invalid custom provider config edits`);return rp(`batch-write-config-value`,{hostId:`local`,edits,filePath:null,expectedVersion:null,reloadUserConfig:!0})};/* " + MARKER + ":config-bridge */";
    const bridgeMarker = "/* " + MARKER + ":config-bridge */";
    const markerIndex = source.indexOf(bridgeMarker);
    const bridgeStart = source.lastIndexOf("globalThis.__cdrWriteConfigEdits=", markerIndex);
    if (markerIndex < 0 || bridgeStart < 0) throw new Error("custom-provider config bridge marker is malformed");
    source = source.slice(0, bridgeStart) + safeBridge + source.slice(markerIndex + bridgeMarker.length);
    if (!source.includes(safeBridge)) throw new Error("custom-provider config bridge is not the validated bridge");
    for (const marker of [MARKER + ":route", MARKER + ":l2l"]) {
      if (!source.includes(marker)) throw new Error(`custom providers ${marker} is missing`);
    }
    if (!source.includes("module.CDRCustomProvidersPanelV2")) throw new Error("module-scoped custom providers lazy loader is missing");
    return source;
  }

  // Expose the existing, host-aware config dispatcher to the settings panel.
  // The panel sends the same batchWrite shape used by native settings.
  const bridgeAnchor = 'function Yyu(e){let t=(0,Xyu.c)(29),';
  const bridgeCode = "globalThis.__cdrWriteConfigEdits=edits=>{let providerPath=/^model_providers\\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;let credentialPath=/^model_providers\\.[A-Za-z0-9][A-Za-z0-9_-]{0,63}\\.(?:experimental_bearer_token|env_key)$/;let validEnv=v=>!v||/^[A-Z_][A-Z0-9_]{0,127}$/.test(v);let validUrl=v=>{try{let u=new URL(v);let h=u.hostname.toLowerCase();return!u.username&&!u.password&&(u.protocol===`https:`||(u.protocol===`http:`&&[`localhost`,`127.0.0.1`,`[::1]`,`::1`].includes(h)))}catch{return!1}};let valid=e=>{if(!e||typeof e.keyPath!==`string`||!(`model`===e.keyPath||`model_provider`===e.keyPath||providerPath.test(e.keyPath)||credentialPath.test(e.keyPath)))return!1;if(!(`replace`===e.mergeStrategy||`upsert`===e.mergeStrategy))return!1;if(`model`===e.keyPath||`model_provider`===e.keyPath)return typeof e.value===`string`&&e.value.length>0;if(credentialPath.test(e.keyPath))return e.value===null||(e.keyPath.endsWith(`.env_key`)?typeof e.value===`string`&&validEnv(e.value):typeof e.value===`string`);if(!e.value||typeof e.value!==`object`||Array.isArray(e.value))return!1;let keys=Object.keys(e.value);if(!keys.includes(`name`)||!keys.includes(`base_url`)||!keys.includes(`wire_api`))return!1;if(keys.includes(`env_key`)&&keys.includes(`experimental_bearer_token`))return!1;if(e.value.wire_api!==`responses`||typeof e.value.name!==`string`||!e.value.name||typeof e.value.base_url!==`string`||!validUrl(e.value.base_url)||(`env_key`in e.value&&!validEnv(e.value.env_key)))return!1;return keys.every(k=>[`name`,`base_url`,`wire_api`,`env_key`,`experimental_bearer_token`].includes(k))&&keys.every(k=>typeof e.value[k]===`string`)};if(!Array.isArray(edits)||edits.length>64||edits.some(e=>!valid(e)))throw Error(`Invalid custom provider config edits`);return rp(`batch-write-config-value`,{hostId:`local`,edits,filePath:null,expectedVersion:null,reloadUserConfig:!0})};/* " + MARKER + ":config-bridge */";
  if (source.includes(bridgeAnchor)) {
    source = replaceOne(source, bridgeAnchor, bridgeCode + bridgeAnchor, "install custom-provider config bridge");
  } else {
    throw new Error("26.727 settings module boundary not found for config bridge");
  }

  // 1. Add custom-providers entry to the r4l nav message descriptor map.
  //    r4l=nd({..."skills-settings":{...}})
  //    We insert before the closing }} of the skills-settings entry.
  const r4lAnchor = '"skills-settings":{id:`settings.nav.skills-settings`,defaultMessage:`Skills`,description:`Title for skills settings section`}}';
  // Keep the first trailing brace (it closes skills-settings), insert the new
  // sibling, then reuse the final brace as the nav-map close.
  const r4lNew = r4lAnchor.slice(0, -1) + ',"custom-providers":{id:`settings.nav.custom-providers`,defaultMessage:`Custom Providers`,description:`Title for custom models and providers settings section`}}';
  if (source.includes(r4lAnchor)) {
    source = replaceOne(source, r4lAnchor, r4lNew, "add custom-providers to r4l nav message map");
  } else {
    throw new Error("r4l nav message map anchor not found in monolith");
  }

  // 2. Add a case for custom-providers to the s4l section label switch.
  //    The last case ends with: ...e=t[28],e}}
  //    The first } closes the case block, the second } closes the switch statement.
  //    We must insert the new case BETWEEN them — so the anchor uses only ONE }.
  const s4lAnchor = 'case`skills-settings`:{let e;return t[28]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,w7.jsx)(Z,{id:`settings.section.skills-settings`,defaultMessage:`Skills`,description:`Title for skills settings section`}),t[28]=e):e=t[28],e}';
  //    IMPORTANT: s4lNew ends with ONE `}` (case block close only), NOT `}}`.
  //    The remaining source after the anchor has `}}` (switch close + function close)
  //    which follow naturally — adding `}}` here would produce an extra `}` on rebuild.
  const s4lNew = s4lAnchor + 'case`custom-providers`:{let e;return t[29]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,w7.jsx)(Z,{id:`settings.section.custom-providers`,defaultMessage:`Custom Providers`,description:`Title for custom models and providers settings section`}),t[29]=e):e=t[29],e}';
  if (source.includes(s4lAnchor)) {
    source = replaceOne(source, s4lAnchor, s4lNew, "add custom-providers to s4l section label switch");
  } else {
    throw new Error("s4l section label switch anchor not found in monolith");
  }

  // 3. Bump the s4l memo cache from 29 to 30 to accommodate the new t[29] index.
  //    The s4l function starts with: function s4l(e){let t=(0,c4l.c)(29),
  const cacheAnchor = 'function s4l(e){let t=(0,c4l.c)(29),';
  const cacheNew = 'function s4l(e){let t=(0,c4l.c)(30),';
  if (source.includes(cacheAnchor)) {
    source = replaceOne(source, cacheAnchor, cacheNew, "bump s4l memo cache 29→30");
  }

  // 4. Register the route. Labels alone do not make a settings section reachable.
  const routeAnchor = '{slug:`data-controls`}]}))';
  const routeNew = '{slug:`data-controls`},{slug:`custom-providers`}]}))/* ' + MARKER + ':route */';
  if (source.includes(routeAnchor)) {
    source = replaceOne(source, routeAnchor, routeNew, "register custom-providers route");
  } else {
    throw new Error("Q3o settings route registry anchor not found");
  }

  // 5. Add custom-providers to the L2l lazy panel load map so the panel renders when clicked.
  //    L2l ends with: ...SkillsSettings)}  where } closes the L2l object.
  //    We must insert the new entry BEFORE the } so it's inside the object.
  const L2L_MARKER = MARKER + ":l2l";
  if (!source.includes(L2L_MARKER)) {
    const l2lEnd = '.SkillsSettings)}';
    if (!sectionsModuleName) throw new Error("settings sections module name is required");
    const l2lNew = '.SkillsSettings),"custom-providers":JY(async()=>{let module=await import(`./' + sectionsModuleName + '`);let panel=module.CDRCustomProvidersPanelV2;if(typeof panel!==`function`)throw new Error(`Custom Providers module export is unavailable`);return panel})}';
    if (source.includes(l2lEnd)) {
      source = replaceOne(source, l2lEnd, l2lNew, "add custom-providers to L2l lazy panel map");
    } else {
      throw new Error("L2l lazy panel map end anchor not found in monolith");
    }
  }

  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error("parse failed after monolith patch: " + e.message);
  }

  source += "\n/* " + R4L_MARKER + " */\n";
  if (!source.includes(L2L_MARKER)) source += "\n/* " + L2L_MARKER + " */\n";
  return source;
}

// ─── Patch settings-page i18n label string ───
function patchSettingsPage(source) {
  if (source.includes(MARKER + ":labels")) return source;

  // The label string ends with data-controls`.split(`.`)
  const labelOld = "data-controls`.split(`.`)";
  const labelNew = "data-controls.custom-providers`.split(`.`)";
  if (source.includes(labelOld)) {
    source = replaceOne(source, labelOld, labelNew, "add custom-providers to i18n labels");
  } else {
    throw new Error("i18n label string anchor not found in settings-page");
  }

  source = replaceOne(
    source,
    "`plugins-settings`,`skills-settings`,`browser-use`,`computer-use`]",
    "`plugins-settings`,`skills-settings`,`custom-providers`,`browser-use`,`computer-use`]",
    "add custom-providers to Integrations navigation group",
  );

  try {
    acorn.parse(source, { ecmaVersion: "latest", sourceType: "module" });
  } catch (e) {
    throw new Error("parse failed after settings-page patch: " + e.message);
  }

  source += "\n/* " + MARKER + ":labels */\n";
  return source;
}

function main() {
  recoverBundleTransactions(ASSETS);
  const sectionsFile = asset("use-visible-settings-sections-");
  const settingsFile = asset("settings-page-");
  const monoFile = asset("app-initial-");

  const sectionsSrc = fs.readFileSync(sectionsFile, "utf8");
  const settingsSrc = fs.readFileSync(settingsFile, "utf8");
  const monoSrc = fs.readFileSync(monoFile, "utf8");

  const sectionsChunk = fs.readFileSync(sectionsFile, "utf8");
  const dependencyIndices = resolveDependencyIndices(monoSrc, sectionsChunk, path.basename(monoFile));
  const nextSections = patchSectionsBundle(sectionsSrc);
  const nextSettings = patchSettingsPage(settingsSrc);
  const nextMono = patchMonolith(monoSrc, path.basename(sectionsFile), dependencyIndices);
  if (!process.argv.includes("--check")) {

    commitBundleSet([
      { file: sectionsFile, previous: sectionsSrc, next: nextSections },
      { file: settingsFile, previous: settingsSrc, next: nextSettings },
      { file: monoFile, previous: monoSrc, next: nextMono },
    ]);
  }

  console.log(process.argv.includes("--check") ? "custom providers settings check ok" : "custom providers settings patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { MARKER, LOADER_MARKER, PANEL_EXPORT_MARKER, ICON_EXPORT_MARKER, SLUG, LS_KEY, commitBundleSet, recoverBundleTransactions, recoverTransaction, dependencyTable, resolveDependencyIndices, ensurePanelLoaderExport, patchSectionsBundle, patchSettingsPage, patchMonolith };
