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

function ensurePanelLoaderExport(source) {
  // Older patch revisions installed a second copy inside the bundle initializer
  // and published it through window. The lazy route now consumes a real ESM
  // export, so keeping that registry only adds an initialization-order hazard.
  source = source.replace(PANEL_CODE, "");
  source = source.replace(ICON_CODE, "");
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
  if (source.includes(PANEL_EXPORT_MARKER)) {
    source = source.replace(/\bs\.use(State|Effect)\b/g, "CDRReact.use$1");
    source = source.replace("return(0,U.jsx)(tag,p)", "return(0,CDRJsx.jsx)(tag,p)");
    source = source.replace(
      "function CDRCustomProvidersIconV2(e){/* " + ICON_EXPORT_MARKER + " */return(0,U.jsx)",
      "function CDRCustomProvidersIconV2(e){/* " + ICON_EXPORT_MARKER + " */return(0,CDRJsx.jsx)",
    );
    if (!source.includes("const CDRReact=CDRInterop(y(),1);")) {
      source = source.replace(
        "function CDRCustomProvidersPanelV2(){",
        "const CDRReact=CDRInterop(y(),1);\nfunction CDRCustomProvidersPanelV2(){",
      );
    }
    if (!source.includes("const CDRJsx=a();")) {
      source = source.replace("const CDRReact=", "const CDRJsx=a();\nconst CDRReact=");
    }
  }
  const hasPanel = source.includes(PANEL_EXPORT_MARKER);
  const hasIcon = source.includes(ICON_EXPORT_MARKER);
  if (hasPanel && hasIcon) return source;
  const definitions = [];
  if (!hasPanel) {
    definitions.push(PANEL_CODE.replace(
      `function CDRCustomProvidersPanel(){/* ${MARKER}:panel */`,
      `function CDRCustomProvidersPanelV2(){/* ${PANEL_EXPORT_MARKER} */`,
    ));
  }
  if (!hasIcon) {
    definitions.push(ICON_CODE.replace(
      "function CDRCustomProvidersIcon(e){",
      `function CDRCustomProvidersIconV2(e){/* ${ICON_EXPORT_MARKER} */`,
    ));
  }
  return replaceOne(
    source,
    "export{",
    definitions.join("\n") + "\nexport{" + (hasPanel ? "" : "CDRCustomProvidersPanelV2 as CDRCustomProvidersPanelV2,"),
    "export module-scoped custom providers panel and icon",
  );
}

// ─── The React component injected into the settings page ───
// Uses U (JSX factory) and React hooks from the bundle's imports.
// Provider data is stored in localStorage as JSON. TOML is generated
// client-side and shown in a textarea for the user to copy.
const PANEL_CODE = `
const CDRJsx=a();
const CDRReact=CDRInterop(y(),1);
function CDRCustomProvidersPanel(){/* ${MARKER}:panel */
let [providers,setProviders]=CDRReact.useState([]);
let [editing,setEditing]=CDRReact.useState(null);
let [showToml,setShowToml]=CDRReact.useState(!1);
let [copied,setCopied]=CDRReact.useState(!1);
let [removed,setRemoved]=CDRReact.useState([]);
let [status,setStatus]=CDRReact.useState('');
let [saving,setSaving]=CDRReact.useState(!1);
CDRReact.useEffect(()=>{try{let d=JSON.parse(localStorage.getItem('${LS_KEY}')||'[]');if(Array.isArray(d))setProviders(d)}catch{}},[]);
let save=(next)=>{setProviders(next);try{localStorage.setItem('${LS_KEY}',JSON.stringify(next.map(({api_key,...p})=>p)))}catch{}};
let addProvider=()=>{let id='prov-'+Date.now();let p={id,name:'',display_name:'',base_url:'',api_key:'',model:'',env_key:'',active:providers.length===0};let next=[...providers,p];save(next);setEditing(id)};
let updateProvider=(id,field,val)=>{let next=providers.map(p=>p.id===id?{...p,[field]:val}:p);save(next)};
let deleteProvider=(id)=>{let old=providers.find(p=>p.id===id);if(old?.name)setRemoved(v=>[...new Set([...v,old.name])]);let next=providers.filter(p=>p.id!==id);save(next);if(editing===id)setEditing(null)};
let applyPreset=(preset)=>{let id='prov-'+Date.now();let p={id,...preset,api_key:'',model:'',active:providers.length===0};let next=[...providers,p];save(next);setEditing(id)};
let validName=p=>/^[A-Za-z0-9_-]+$/.test(String(p.name||''))&&!['openai','ollama','lmstudio'].includes(String(p.name||'').toLowerCase());
let genToml=()=>{let lines=[];for(let p of providers){if(!validName(p))continue;lines.push('[model_providers.'+p.name+']');lines.push('name = "'+(p.display_name||p.name)+'"');if(p.base_url)lines.push('base_url = "'+p.base_url+'"');if(p.env_key)lines.push('env_key = "'+p.env_key.toUpperCase()+'"');else if(p.api_key)lines.push('experimental_bearer_token = "<redacted>"');lines.push('wire_api = "responses"');lines.push('')}let m=providers.find(p=>p.active&&p.model&&validName(p));if(m){lines.push('model = "'+m.model+'"');lines.push('model_provider = "'+m.name+'"');lines.push('')}return lines.join('\\n')};
let applyConfig=async()=>{if(saving)return;let clean=providers.filter(validName);if(clean.length!==providers.length){setStatus('Provider IDs may use letters, numbers, _ or - and cannot be openai, ollama, or lmstudio.');return}if(!clean.length&&removed.length===0){setStatus('Add a provider first.');return}let edits=[];for(let name of removed)edits.push({keyPath:'model_providers.'+name,value:null,mergeStrategy:'replace'});for(let p of clean){let value={name:p.display_name||p.name,wire_api:'responses'};if(p.base_url)value.base_url=p.base_url;if(p.env_key)value.env_key=p.env_key.toUpperCase();else if(p.api_key)value.experimental_bearer_token=p.api_key;edits.push({keyPath:'model_providers.'+p.name,value,mergeStrategy:'replace'})}let active=clean.find(p=>p.active&&p.model);if(active){edits.push({keyPath:'model_provider',value:active.name,mergeStrategy:'upsert'},{keyPath:'model',value:active.model,mergeStrategy:'upsert'})}setSaving(!0);setStatus('Saving to Codex config…');try{let write=globalThis.__cdrWriteConfigEdits;if(typeof write!=='function')throw Error('Codex config bridge is unavailable');await write(edits);setRemoved([]);save(clean.map(p=>({...p,api_key:''})));setStatus('Saved. New turns will use the updated config.')}catch(err){setStatus('Save failed: '+String(err&&err.message||err))}finally{setSaving(!1)}};
let copyToml=()=>{try{navigator.clipboard.writeText(genToml());setCopied(!0);setTimeout(()=>setCopied(!1),2e3)}catch{}};
let presets=[{name:'openrouter',display_name:'OpenRouter',base_url:'https://openrouter.ai/api/v1',env_key:'OPENROUTER_API_KEY',label:'OpenRouter'}];
let inputStyle={width:'100%',padding:'8px 12px',borderRadius:'8px',border:'1px solid var(--token-border,rgba(255,255,255,.15))',background:'var(--token-main-surface,transparent)',color:'inherit',fontSize:'14px',outline:'none'};
let labelStyle={display:'block',fontSize:'12px',color:'var(--token-text-tertiary,#888)',marginBottom:'4px',marginTop:'12px'};
let btnStyle={padding:'8px 16px',borderRadius:'8px',border:'1px solid var(--token-border,rgba(255,255,255,.15))',background:'transparent',color:'inherit',fontSize:'14px',cursor:'pointer'};
let primaryBtn={...btnStyle,background:'var(--token-main,#2563eb)',borderColor:'transparent',color:'#fff',fontWeight:600};
let cardStyle={border:'1px solid var(--token-border,rgba(255,255,255,.1))',borderRadius:'12px',padding:'16px',marginBottom:'12px'};
let el=(tag,props,...kids)=>{let p={...props};if(kids.length===1)p.children=kids[0];else if(kids.length>1)p.children=kids;return(0,CDRJsx.jsx)(tag,p)};
return el('div',{style:{padding:'24px',maxWidth:'680px'},['data-cdr-custom-providers']:!0},
  el('h2',{style:{fontSize:'20px',fontWeight:700,marginBottom:'4px'}},'Custom Models & Providers'),
  el('p',{style:{fontSize:'14px',color:'var(--token-text-tertiary,#888)',marginBottom:'20px'}},'Add Responses API-compatible providers and save them directly to Codex config.'),
  // Preset buttons
  el('div',{style:{marginBottom:'20px'}},
    el('p',{style:{...labelStyle,marginTop:'0'}},'Quick presets:'),
    ...presets.map(p=>el('button',{key:p.name,onClick:()=>applyPreset(p),style:{...btnStyle,marginRight:'8px'}},p.label))
  ),
  // Provider list
  ...providers.map(p=>el('div',{key:p.id,style:cardStyle},
    el('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}},
      el('strong',{style:{fontSize:'15px'}},p.name||'(unnamed)'),
      el('div',{},
        el('button',{onClick:()=>setEditing(editing===p.id?null:p.id),style:{...btnStyle,marginRight:'4px',padding:'4px 12px',fontSize:'12px'}},editing===p.id?'Done':'Edit'),
        el('button',{onClick:()=>deleteProvider(p.id),style:{...btnStyle,padding:'4px 12px',fontSize:'12px',color:'#dc2626'}},'Delete')
      )
    ),
    editing===p.id?el('div',{},
      el('label',{style:labelStyle},'Provider ID'),
      el('input',{style:inputStyle,value:p.name,onChange:e=>updateProvider(p.id,'name',e.target.value),placeholder:'openrouter'}),
      el('label',{style:labelStyle},'Display name'),
      el('input',{style:inputStyle,value:p.display_name||'',onChange:e=>updateProvider(p.id,'display_name',e.target.value),placeholder:'OpenRouter'}),
      el('label',{style:labelStyle},'Base URL'),
      el('input',{style:inputStyle,value:p.base_url,onChange:e=>updateProvider(p.id,'base_url',e.target.value),placeholder:'https://openrouter.ai/api/v1'}),
      el('label',{style:labelStyle},'Direct bearer token (optional; env var is recommended)'),
      el('input',{type:'password',style:inputStyle,value:p.api_key,onChange:e=>updateProvider(p.id,'api_key',e.target.value),placeholder:'sk-...'}),
      el('label',{style:labelStyle},'Env var name (for config.toml env_key)'),
      el('input',{style:inputStyle,value:p.env_key,onChange:e=>updateProvider(p.id,'env_key',e.target.value),placeholder:'OPENROUTER_API_KEY'}),
      el('label',{style:labelStyle},'Default model (optional)'),
      el('input',{style:inputStyle,value:p.model,onChange:e=>updateProvider(p.id,'model',e.target.value),placeholder:'provider/model-name'}),
      el('label',{style:{...labelStyle,display:'flex',gap:'8px',alignItems:'center'}},el('input',{type:'checkbox',checked:!!p.active,onChange:e=>{let next=providers.map(x=>({...x,active:x.id===p.id?e.target.checked:!1}));save(next)}}),'Make this the active Codex provider/model')
    ):el('div',{style:{fontSize:'13px',color:'var(--token-text-tertiary,#aaa)'}},
      el('div',{},'URL: '+(p.base_url||'—')+'  |  Responses API'+(p.model?'  |  model: '+p.model:'')+(p.active?'  |  active':''))
    )
  )),
  // Add + TOML buttons
  el('div',{style:{display:'flex',gap:'8px',marginBottom:'20px'}},
    el('button',{onClick:addProvider,style:primaryBtn},'+ Add Provider'),
    el('button',{onClick:applyConfig,style:primaryBtn,disabled:saving},saving?'Saving…':'Save to Codex'),
    el('button',{onClick:()=>setShowToml(!showToml),style:btnStyle,disabled:providers.length===0},showToml?'Hide TOML':'Generate TOML')
  ),
  status?el('p',{role:'status',style:{fontSize:'13px',marginBottom:'16px',color:status.startsWith('Save failed')||status.startsWith('Provider IDs')?'#dc2626':'var(--token-text-secondary,#aaa)'}},status):null,
  // TOML output
  showToml&&providers.length>0?el('div',{style:{...cardStyle,background:'var(--token-code-surface,rgba(0,0,0,.3))'}},
    el('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'8px'}},
      el('strong',{style:{fontSize:'14px'}},'config.toml snippet'),
      el('button',{onClick:copyToml,style:{...btnStyle,padding:'4px 12px',fontSize:'12px'}},copied?'Copied!':'Copy')
    ),
    el('pre',{style:{whiteSpace:'pre-wrap',wordBreak:'break-all',fontSize:'13px',fontFamily:'monospace',margin:0,padding:'12px',background:'rgba(0,0,0,.2)',borderRadius:'8px',color:'var(--token-text-secondary,#ccc)'}},genToml())
  ):null,
  el('p',{style:{fontSize:'12px',color:'var(--token-text-tertiary,#666)',marginTop:'16px'}},'Environment variables are recommended. A direct bearer token is written to config.toml only when supplied and is never cached in localStorage. Codex supports the Responses wire API for custom providers.')
)}
`;

// ─── Patch use-visible-settings-sections ───
function patchSectionsBundle(source) {
  if (source.includes(MARKER + ":applied")) return ensurePanelLoaderExport(source);

  // 1. Add slug to the Z array
  const zOld = "Z=[`profile`,`agent`,`personalization`,`mcp-settings`,`plugins-settings`,`hooks-settings`,`local-environments`,`worktrees`,`data-controls`]";
  const zNew = "Z=[`profile`,`agent`,`personalization`,`mcp-settings`,`plugins-settings`,`hooks-settings`,`local-environments`,`worktrees`,`data-controls`,`" + SLUG + "`]";
  if (source.includes(zOld)) {
    source = replaceOne(source, zOld, zNew, "add custom-providers slug to Z array");
  } else if (!source.includes("`custom-providers`")) {
    throw new Error("Z array anchor not found");
  }

  // 2. Inject the icon component. The panel itself is appended at module scope
  //    by ensurePanelLoaderExport so the route can import it directly.
  //    before the it={...} map. The it map maps slugs to ICON components (not panels).
  //    So "custom-providers" maps to CDRCustomProvidersIcon, not CDRCustomProvidersPanel.
  //    The bundle initializer publishes the panel after a real dynamic import.
  const itAnchor = "it={\"general-settings\":N,";
  const itNew = "it={\"custom-providers\":CDRCustomProvidersIconV2,\"general-settings\":N,";
  if (source.includes(itAnchor)) {
    source = source.replace(itAnchor, itNew);
  } else {
    throw new Error("it component map anchor not found");
  }

  source = replaceOne(
    source,
    "case`data-controls`:return!0;",
    "case`data-controls`:case`custom-providers`:return!0;",
    "make custom-providers visible",
  );
  source = replaceOne(
    source,
    "case`git-settings`:case`data-controls`:case`code-review`:",
    "case`git-settings`:case`data-controls`:case`custom-providers`:case`code-review`:",
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
function patchMonolith(source, sectionsModuleName) {
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
    for (const marker of [MARKER + ":route", MARKER + ":l2l"]) {
      if (!source.includes(marker)) throw new Error(`custom providers ${marker} is missing`);
    }
    if (!source.includes("module.CDRCustomProvidersPanelV2")) throw new Error("module-scoped custom providers lazy loader is missing");
    return source;
  }

  // Expose the existing, host-aware config dispatcher to the settings panel.
  // The panel sends the same batchWrite shape used by native settings.
  const bridgeAnchor = 'r4l=nd({';
  const bridgeCode = "globalThis.__cdrWriteConfigEdits=edits=>Rf(`batch-write-config-value`,{hostId:`local`,edits,filePath:null,expectedVersion:null,reloadUserConfig:!0});/* " + MARKER + ":config-bridge */";
  if (source.includes(bridgeAnchor)) {
    source = replaceOne(source, bridgeAnchor, bridgeCode + bridgeAnchor, "install custom-provider config bridge");
  } else {
    throw new Error("settings nav map initializer not found for config bridge");
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
  const s4lAnchor = 'case`skills-settings`:{let e;return t[28]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,T7.jsx)(Z,{id:`settings.section.skills-settings`,defaultMessage:`Skills`,description:`Title for skills settings section`}),t[28]=e):e=t[28],e}';
  //    IMPORTANT: s4lNew ends with ONE `}` (case block close only), NOT `}}`.
  //    The remaining source after the anchor has `}}` (switch close + function close)
  //    which follow naturally — adding `}}` here would produce an extra `}` on rebuild.
  const s4lNew = s4lAnchor + 'case`custom-providers`:{let e;return t[29]===Symbol.for(`react.memo_cache_sentinel`)?(e=(0,T7.jsx)(Z,{id:`settings.section.custom-providers`,defaultMessage:`Custom Providers`,description:`Title for custom models and providers settings section`}),t[29]=e):e=t[29],e}';
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
  const sectionsFile = asset("use-visible-settings-sections-");
  const settingsFile = asset("settings-page-");
  const monoFile = asset("app-initial-");

  const sectionsSrc = fs.readFileSync(sectionsFile, "utf8");
  const settingsSrc = fs.readFileSync(settingsFile, "utf8");
  const monoSrc = fs.readFileSync(monoFile, "utf8");

  const nextSections = patchSectionsBundle(sectionsSrc);
  const nextSettings = patchSettingsPage(settingsSrc);
  const nextMono = patchMonolith(monoSrc, path.basename(sectionsFile));

  if (!process.argv.includes("--check")) {
    if (nextSections !== sectionsSrc) fs.writeFileSync(sectionsFile, nextSections);
    if (nextSettings !== settingsSrc) fs.writeFileSync(settingsFile, nextSettings);
    if (nextMono !== monoSrc) fs.writeFileSync(monoFile, nextMono);
  }
  console.log(process.argv.includes("--check") ? "custom providers settings check ok" : "custom providers settings patched");
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}

module.exports = { MARKER, LOADER_MARKER, PANEL_EXPORT_MARKER, ICON_EXPORT_MARKER, SLUG, LS_KEY, ensurePanelLoaderExport, patchSectionsBundle, patchSettingsPage, patchMonolith };
