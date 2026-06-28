/* ── THEME ───────────────────────────────────────────────────────────── */
const THEME_KEY = 'jb_theme';

function applyTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  const icon = theme === 'light' ? '🌙' : '☀';
  document.querySelectorAll('.btn-theme').forEach(btn => btn.textContent = icon);
}

async function loadTheme() {
  return new Promise(resolve => {
    chrome.storage.local.get(THEME_KEY, r => resolve(r[THEME_KEY] || 'dark'));
  });
}

async function toggleTheme() {
  const next = document.body.classList.contains('light') ? 'dark' : 'light';
  chrome.storage.local.set({ [THEME_KEY]: next });
  applyTheme(next);
}

/* ── DB (IndexedDB via chrome.storage.local) ─────────────────────────── */
const DB_KEY = 'jb_history';
const MAX_ENTRIES = 50;

async function dbLoad() {
  return new Promise(resolve => {
    chrome.storage.local.get(DB_KEY, r => resolve(r[DB_KEY] || []));
  });
}

async function dbSave(entries) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [DB_KEY]: entries }, resolve);
  });
}

async function dbAdd(entry) {
  const entries = await dbLoad();
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) entries.length = MAX_ENTRIES;
  await dbSave(entries);
}

async function dbDelete(id) {
  const entries = await dbLoad();
  await dbSave(entries.filter(e => e.id !== id));
}

async function dbClear() {
  await dbSave([]);
}

/* ── SCREENS ─────────────────────────────────────────────────────────── */
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

/* ── JSON TREE RENDERER ──────────────────────────────────────────────── */
function renderTree(value) {
  const container = document.createElement('div');

  function escapeStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  function valMeta(val) {
    if (val === null)             return { cls: 'jn-null', txt: 'null' };
    if (typeof val === 'boolean') return { cls: 'jn-bool', txt: String(val) };
    if (typeof val === 'number')  return { cls: 'jn-num',  txt: String(val) };
    return { cls: 'jn-str', txt: `"${escapeStr(String(val))}"` };
  }

  function makeEditable(span, currentVal, setter) {
    span.title = 'Double-click to edit';
    span.addEventListener('dblclick', e => {
      e.stopPropagation();
      const raw = typeof currentVal === 'string' ? currentVal : JSON.stringify(currentVal);
      const input = document.createElement('input');
      input.className = 'jn-edit-input ' + span.className;
      input.value = raw;
      input.style.width = Math.max(raw.length + 1, 3) + 'ch';
      span.replaceWith(input);
      input.focus();
      input.select();

      let done = false;

      function commit() {
        if (done) return; done = true;
        const v = input.value;
        let newVal;
        try { newVal = JSON.parse(v); } catch { newVal = v; }
        setter(newVal);
        const { cls, txt } = valMeta(newVal);
        const newSpan = Object.assign(document.createElement('span'), { className: cls, textContent: txt });
        makeEditable(newSpan, newVal, setter);
        input.replaceWith(newSpan);
      }

      function cancel() {
        if (done) return; done = true;
        input.replaceWith(span);
      }

      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { ev.preventDefault(); cancel(); }
      });
      input.addEventListener('input', () => {
        input.style.width = Math.max(input.value.length + 1, 3) + 'ch';
      });
    });
  }

  function build(val, key, parent, setter) {
    const wrap = document.createElement('div');

    const keySpan = key !== null
      ? Object.assign(document.createElement('span'), { className: 'jn-key', textContent: `"${key}": ` })
      : null;

    if (val === null || typeof val === 'boolean' || typeof val === 'number' || typeof val === 'string') {
      if (keySpan) wrap.appendChild(keySpan);
      const { cls, txt } = valMeta(val);
      const valueSpan = Object.assign(document.createElement('span'), { className: cls, textContent: txt });
      if (setter) makeEditable(valueSpan, val, setter);
      wrap.appendChild(valueSpan);
    } else if (Array.isArray(val)) {
      buildCollection(val, key, wrap, '[', ']', true);
    } else if (typeof val === 'object') {
      buildCollection(val, key, wrap, '{', '}', false);
    }

    parent.appendChild(wrap);
  }

  function buildCollection(val, key, wrap, open, close, isArr) {
    const entries = isArr ? val : Object.entries(val);
    const count = entries.length;
    const isEmpty = count === 0;

    const toggle = Object.assign(document.createElement('span'), {
      className: 'jn-toggle',
      textContent: '▾',
    });

    const keySpan = key !== null
      ? Object.assign(document.createElement('span'), { className: 'jn-key', textContent: `"${key}": ` })
      : null;

    const openSpan = document.createTextNode(open);
    const closeWrap = document.createElement('div');
    const summary = Object.assign(document.createElement('span'), {
      className: 'jn-summary',
      textContent: isArr ? ` ${count} items ` : ` ${count} keys `,
      style: 'display:none',
    });

    if (!isEmpty) wrap.appendChild(toggle);
    if (keySpan) wrap.appendChild(keySpan);
    wrap.appendChild(openSpan);
    if (!isEmpty) wrap.appendChild(summary);

    const children = document.createElement('div');
    children.className = 'jn-children';

    if (isArr) {
      val.forEach((item, i) => build(item, null, children, newVal => { val[i] = newVal; }));
    } else {
      Object.entries(val).forEach(([k, v]) => build(v, k, children, newVal => { val[k] = newVal; }));
    }

    wrap.appendChild(children);
    closeWrap.textContent = close;
    wrap.appendChild(closeWrap);

    if (!isEmpty) {
      toggle.addEventListener('click', () => {
        const collapsed = children.classList.toggle('collapsed');
        toggle.textContent = collapsed ? '▸' : '▾';
        summary.style.display = collapsed ? 'inline' : 'none';
      });
    }
  }

  build(value, null, container, null);
  return container;
}

/* ── JSON AUTO-REPAIR ────────────────────────────────────────────────── */
function repairJSON(str) {
  // Fix 1: remove literal newline/carriage-return characters inside strings
  // (they are copy-paste artifacts — valid JSON requires \n escape sequences)
  let fixed = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (escaped) { fixed += ch; escaped = false; continue; }
    if (ch === '\\' && inString) { fixed += ch; escaped = true; continue; }
    if (ch === '"') { inString = !inString; fixed += ch; continue; }
    if (inString && (ch === '\n' || ch === '\r')) continue; // strip bad chars
    fixed += ch;
  }

  // Fix 2: close any unclosed { [ brackets left by truncation
  const stack = [];
  inString = false;
  escaped = false;

  for (let i = 0; i < fixed.length; i++) {
    const ch = fixed[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\' && inString) { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') stack.push('}');
    else if (ch === '[') stack.push(']');
    else if (ch === '}' || ch === ']') stack.pop();
  }

  while (stack.length) fixed += stack.pop();
  return fixed;
}

/* ── KOTLIN CONVERTER ────────────────────────────────────────────────── */
function toCamelCase(key) {
  return key
    .replace(/[-_\s]+(.)/g, (_, c) => c.toUpperCase())
    .replace(/^(.)/, c => c.toLowerCase());
}

function toPascalCase(key) {
  const s = toCamelCase(key);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function singularize(key) {
  if (key.endsWith('ies')) return key.slice(0, -3) + 'y';
  if (key.endsWith('ses') || key.endsWith('xes') || key.endsWith('zes')) return key.slice(0, -2);
  if (key.length > 1 && key.endsWith('s')) return key.slice(0, -1);
  return key + 'Item';
}

function jsonToKotlin(value, rootName, opts) {
  const { serializable, allNullable, useVar } = opts;
  const classes = new Map();
  const usedNames = new Set();

  function uniqueName(name) {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    let i = 2;
    while (usedNames.has(name + i)) i++;
    usedNames.add(name + i);
    return name + i;
  }

  function mergeObjects(arr) {
    const merged = {};
    for (const obj of arr) {
      for (const [k, v] of Object.entries(obj)) {
        if (!(k in merged) || merged[k] === null) merged[k] = v;
      }
    }
    return merged;
  }

  function inferArrayItemType(arr, key) {
    const types = arr.map(item => {
      if (item === null) return 'null';
      if (typeof item === 'boolean') return 'Boolean';
      if (typeof item === 'number') return Number.isInteger(item) ? 'Int' : 'Double';
      if (typeof item === 'string') return 'String';
      if (Array.isArray(item)) return 'List';
      if (typeof item === 'object') return 'object';
      return 'Any';
    });
    const unique = [...new Set(types)];
    if (unique.length === 1) {
      if (unique[0] === 'object') {
        const objs = arr.filter(x => x && typeof x === 'object' && !Array.isArray(x));
        return inferClass(mergeObjects(objs), toPascalCase(singularize(key)));
      }
      if (unique[0] === 'null') return 'Any?';
      return unique[0];
    }
    if (unique.every(t => ['Int', 'Long'].includes(t))) return 'Long';
    if (unique.every(t => ['Int', 'Long', 'Double'].includes(t))) return 'Double';
    const nonNull = unique.filter(t => t !== 'null');
    if (nonNull.length === 1 && !['object', 'List'].includes(nonNull[0])) return nonNull[0] + '?';
    return 'Any';
  }

  function inferType(val, key) {
    if (val === null) return { type: 'Any', nullable: true };
    if (typeof val === 'boolean') return { type: 'Boolean', nullable: false };
    if (typeof val === 'number') {
      return { type: Number.isInteger(val) && Math.abs(val) <= 2147483647 ? 'Int' : Number.isInteger(val) ? 'Long' : 'Double', nullable: false };
    }
    if (typeof val === 'string') return { type: 'String', nullable: false };
    if (Array.isArray(val)) {
      if (!val.length) return { type: 'List<Any>', nullable: false };
      return { type: `List<${inferArrayItemType(val, key)}>`, nullable: false };
    }
    if (typeof val === 'object') return { type: inferClass(val, toPascalCase(key)), nullable: false };
    return { type: 'Any', nullable: false };
  }

  function inferClass(obj, className) {
    const name = uniqueName(className);
    const fields = [];
    classes.set(name, fields);
    for (const [key, val] of Object.entries(obj)) {
      const camelName = toCamelCase(key);
      const { type, nullable } = inferType(val, key);
      fields.push({ name: camelName, type, nullable: allNullable || nullable, originalKey: key, needsAnnotation: camelName !== key });
    }
    return name;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    inferClass(value, rootName);
  } else {
    const { type } = inferType(value, rootName);
    classes.set(uniqueName(rootName), [{ name: 'value', type, nullable: allNullable, originalKey: 'value', needsAnnotation: false }]);
  }

  const needsSerialName = serializable && [...classes.values()].some(f => f.some(x => x.needsAnnotation));
  const { packageName } = opts;
  const lines = [];
  if (packageName) { lines.push(`package ${packageName}`); lines.push(''); }
  if (serializable) {
    lines.push('import kotlinx.serialization.Serializable');
    if (needsSerialName) lines.push('import kotlinx.serialization.SerialName');
    lines.push('');
  }

  let first = true;
  for (const [name, fields] of classes) {
    if (!first) lines.push('');
    first = false;
    if (serializable) lines.push('@Serializable');
    lines.push(`data class ${name}(`);
    fields.forEach((f, i) => {
      if (serializable && f.needsAnnotation) lines.push(`    @SerialName("${f.originalKey}")`);
      const comma = i < fields.length - 1 ? ',' : '';
      lines.push(`    ${useVar ? 'var' : 'val'} ${f.name}: ${f.type}${f.nullable ? '?' : ''}${comma}`);
    });
    lines.push(')');
  }
  return lines.join('\n');
}

function renderCode(code, kwRe, typeRe, strRe = /"[^"]*"/g) {
  const pre = document.createElement('pre');
  const annRe = /@\w+/g;

  for (const [li, line] of code.split('\n').entries()) {
    if (li > 0) pre.appendChild(document.createTextNode('\n'));
    const tokens = [];
    const mark = (re, cls) => { re.lastIndex = 0; let m; while ((m = re.exec(line)) !== null) tokens.push({ s: m.index, e: m.index + m[0].length, cls }); };
    mark(strRe, 'kt-str');
    mark(annRe, 'kt-ann');
    mark(kwRe,  'kt-kw');
    mark(typeRe,'kt-type');
    tokens.sort((a, b) => a.s - b.s);
    const final = []; let pos = 0;
    for (const t of tokens) { if (t.s < pos) continue; final.push(t); pos = t.e; }
    let cur = 0;
    for (const t of final) {
      if (t.s > cur) pre.appendChild(document.createTextNode(line.slice(cur, t.s)));
      const span = document.createElement('span');
      span.className = t.cls; span.textContent = line.slice(t.s, t.e);
      pre.appendChild(span); cur = t.e;
    }
    if (cur < line.length) pre.appendChild(document.createTextNode(line.slice(cur)));
  }
  return pre;
}

function renderKotlin(code) {
  return renderCode(code,
    /\b(data|class|val|var|import)\b/g,
    /\b(String|Int|Long|Double|Float|Boolean|List|Map|Set|Any)\b/g);
}

function renderJava(code) {
  return renderCode(code,
    /\b(public|private|class|import|package|void|return|this|new|final)\b/g,
    /\b(String|Integer|int|Long|long|Double|double|Boolean|boolean|Object|List|Map|Set)\b/g);
}

function renderSwift(code) {
  return renderCode(code,
    /\b(import|struct|class|let|var|enum|case|func|return|self|init|guard|if|else)\b/g,
    /\b(String|Int|Double|Float|Bool|Any|Optional)\b/g);
}

function renderFlutter(code) {
  return renderCode(code,
    /\b(import|class|final|var|factory|return|required|this|void|const)\b/g,
    /\b(String|int|double|bool|dynamic|Map|List|num)\b/g,
    /'[^'\n]*'|"[^"\n]*"/g);
}

function jsonToSwift(value, rootName, opts) {
  const { useCodable, useClass, useVar, allNullable } = opts;
  const classes = new Map();
  const usedNames = new Set();

  function uniqueName(name) {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    let i = 2; while (usedNames.has(name + i)) i++;
    usedNames.add(name + i); return name + i;
  }

  function mergeObjects(arr) {
    const merged = {};
    for (const obj of arr) for (const [k, v] of Object.entries(obj)) if (!(k in merged) || merged[k] === null) merged[k] = v;
    return merged;
  }

  function inferArrayItemType(arr, key) {
    const types = arr.map(item => {
      if (item === null) return 'null';
      if (typeof item === 'boolean') return 'Bool';
      if (typeof item === 'number') return Number.isInteger(item) ? 'Int' : 'Double';
      if (typeof item === 'string') return 'String';
      if (typeof item === 'object' && !Array.isArray(item)) return 'object';
      return 'Any';
    });
    const unique = [...new Set(types)];
    if (unique.length === 1) {
      if (unique[0] === 'object') return inferClass(mergeObjects(arr.filter(x => x && typeof x === 'object' && !Array.isArray(x))), toPascalCase(singularize(key)));
      if (unique[0] === 'null') return 'Any?';
      return unique[0];
    }
    if (unique.every(t => ['Int', 'Double'].includes(t))) return 'Double';
    return 'Any';
  }

  function inferType(val, key) {
    if (val === null) return { type: 'Any', nullable: true };
    if (typeof val === 'boolean') return { type: 'Bool', nullable: false };
    if (typeof val === 'number') return { type: Number.isInteger(val) ? 'Int' : 'Double', nullable: false };
    if (typeof val === 'string') return { type: 'String', nullable: false };
    if (Array.isArray(val)) return { type: val.length ? `[${inferArrayItemType(val, key)}]` : '[Any]', nullable: false };
    if (typeof val === 'object') return { type: inferClass(val, toPascalCase(key)), nullable: false };
    return { type: 'Any', nullable: false };
  }

  function inferClass(obj, className) {
    const name = uniqueName(className);
    const fields = [];
    classes.set(name, fields);
    for (const [key, val] of Object.entries(obj)) {
      const camelName = toCamelCase(key);
      const { type, nullable } = inferType(val, key);
      fields.push({ name: camelName, type, nullable: allNullable || nullable, originalKey: key, needsCodingKey: camelName !== key });
    }
    return name;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    inferClass(value, rootName);
  } else {
    const { type } = inferType(value, rootName);
    classes.set(uniqueName(rootName), [{ name: 'value', type, nullable: allNullable, originalKey: 'value', needsCodingKey: false }]);
  }

  const { packageName } = opts;
  const kw = useClass ? 'class' : 'struct';
  const propKw = useVar ? 'var' : 'let';
  const lines = [];
  if (packageName) { lines.push(`// ${packageName}`); lines.push(''); }
  if (useCodable) { lines.push('import Foundation'); lines.push(''); }

  let first = true;
  for (const [name, fields] of classes) {
    if (!first) lines.push('');
    first = false;
    lines.push(`${kw} ${name}${useCodable ? ': Codable' : ''} {`);
    for (const f of fields) lines.push(`    ${propKw} ${f.name}: ${f.type}${f.nullable ? '?' : ''}`);
    const hasDiffKey = fields.some(f => f.needsCodingKey);
    if (useCodable && hasDiffKey) {
      lines.push('');
      lines.push('    enum CodingKeys: String, CodingKey {');
      for (const f of fields) lines.push(f.needsCodingKey ? `        case ${f.name} = "${f.originalKey}"` : `        case ${f.name}`);
      lines.push('    }');
    }
    lines.push('}');
  }
  return lines.join('\n');
}

function jsonToFlutter(value, rootName, opts) {
  const { includeJson, useFinal, allNullable, packageName } = opts;
  const classes = new Map();
  const usedNames = new Set();

  function uniqueName(name) {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    let i = 2; while (usedNames.has(name + i)) i++;
    usedNames.add(name + i); return name + i;
  }

  function mergeObjects(arr) {
    const merged = {};
    for (const obj of arr) for (const [k, v] of Object.entries(obj)) if (!(k in merged) || merged[k] === null) merged[k] = v;
    return merged;
  }

  function inferArrayItem(arr, key) {
    const types = arr.map(item => {
      if (item === null) return 'null';
      if (typeof item === 'boolean') return 'bool';
      if (typeof item === 'number') return Number.isInteger(item) ? 'int' : 'double';
      if (typeof item === 'string') return 'String';
      if (typeof item === 'object' && !Array.isArray(item)) return 'object';
      return 'dynamic';
    });
    const unique = [...new Set(types)];
    if (unique.length === 1) {
      if (unique[0] === 'object') {
        const cn = inferClass(mergeObjects(arr.filter(x => x && typeof x === 'object' && !Array.isArray(x))), toPascalCase(singularize(key)));
        return { itemType: cn, itemIsClass: true };
      }
      if (unique[0] === 'null') return { itemType: 'dynamic', itemIsClass: false };
      return { itemType: unique[0], itemIsClass: false };
    }
    if (unique.every(t => ['int', 'double'].includes(t))) return { itemType: 'double', itemIsClass: false };
    return { itemType: 'dynamic', itemIsClass: false };
  }

  function inferType(val, key) {
    if (val === null) return { type: 'dynamic', isClass: false, isList: false };
    if (typeof val === 'boolean') return { type: 'bool', isClass: false, isList: false };
    if (typeof val === 'number') return { type: Number.isInteger(val) ? 'int' : 'double', isClass: false, isList: false };
    if (typeof val === 'string') return { type: 'String', isClass: false, isList: false };
    if (Array.isArray(val)) {
      if (!val.length) return { type: 'List<dynamic>', isClass: false, isList: true, itemIsClass: false, itemType: 'dynamic' };
      const { itemType, itemIsClass } = inferArrayItem(val, key);
      return { type: `List<${itemType}>`, isClass: false, isList: true, itemIsClass, itemType };
    }
    if (typeof val === 'object') return { type: inferClass(val, toPascalCase(key)), isClass: true, isList: false };
    return { type: 'dynamic', isClass: false, isList: false };
  }

  function inferClass(obj, className) {
    const name = uniqueName(className);
    const fields = [];
    classes.set(name, fields);
    for (const [key, val] of Object.entries(obj)) {
      const meta = inferType(val, key);
      fields.push({ name: toCamelCase(key), originalKey: key, nullable: allNullable, ...meta });
    }
    return name;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    inferClass(value, rootName);
  } else {
    const meta = inferType(value, rootName);
    classes.set(uniqueName(rootName), [{ name: 'value', originalKey: 'value', nullable: allNullable, ...meta }]);
  }

  const lines = [];
  if (packageName) { lines.push(`// ${packageName}`); lines.push(''); }
  let first = true;
  for (const [name, fields] of classes) {
    if (!first) lines.push('');
    first = false;
    lines.push(`class ${name} {`);
    for (const f of fields) {
      lines.push(`  ${useFinal ? 'final ' : ''}${f.type}${f.nullable ? '?' : ''} ${f.name};`);
    }
    lines.push('');
    lines.push(`  ${name}({`);
    for (const f of fields) lines.push(`    required this.${f.name},`);
    lines.push('  });');

    if (includeJson) {
      lines.push('');
      lines.push(`  factory ${name}.fromJson(Map<String, dynamic> json) => ${name}(`);
      for (const f of fields) {
        let rval;
        if (f.isClass) rval = `${f.type}.fromJson(json['${f.originalKey}'])`;
        else if (f.isList && f.itemIsClass) rval = `(json['${f.originalKey}'] as List).map((e) => ${f.itemType}.fromJson(e)).toList()`;
        else if (f.isList) rval = `List<${f.itemType}>.from(json['${f.originalKey}'])`;
        else rval = `json['${f.originalKey}']`;
        lines.push(`        ${f.name}: ${rval},`);
      }
      lines.push('      );');
      lines.push('');
      lines.push('  Map<String, dynamic> toJson() => {');
      for (const f of fields) {
        const rval = f.isClass ? `${f.name}.toJson()` : (f.isList && f.itemIsClass) ? `${f.name}.map((e) => e.toJson()).toList()` : f.name;
        lines.push(`        '${f.originalKey}': ${rval},`);
      }
      lines.push('      };');
    }
    lines.push('}');
  }
  return lines.join('\n');
}

function jsonToJava(value, rootName, opts) {
  const { packageName, annotationStyle, includeGetters } = opts;
  const classes = new Map();
  const usedNames = new Set();

  function uniqueName(name) {
    if (!usedNames.has(name)) { usedNames.add(name); return name; }
    let i = 2; while (usedNames.has(name + i)) i++;
    usedNames.add(name + i); return name + i;
  }

  function mergeObjects(arr) {
    const merged = {};
    for (const obj of arr) for (const [k, v] of Object.entries(obj)) if (!(k in merged) || merged[k] === null) merged[k] = v;
    return merged;
  }

  function inferArrayItemType(arr, key) {
    const types = arr.map(item => {
      if (item === null) return 'null';
      if (typeof item === 'boolean') return 'Boolean';
      if (typeof item === 'number') return Number.isInteger(item) ? 'Integer' : 'Double';
      if (typeof item === 'string') return 'String';
      if (Array.isArray(item)) return 'List';
      if (typeof item === 'object') return 'object';
      return 'Object';
    });
    const unique = [...new Set(types)];
    if (unique.length === 1) {
      if (unique[0] === 'object') return inferClass(mergeObjects(arr.filter(x => x && typeof x === 'object' && !Array.isArray(x))), toPascalCase(singularize(key)));
      if (unique[0] === 'null') return 'Object';
      return unique[0];
    }
    if (unique.every(t => ['Integer', 'Long'].includes(t))) return 'Long';
    if (unique.every(t => ['Integer', 'Long', 'Double'].includes(t))) return 'Double';
    return 'Object';
  }

  function inferType(val, key) {
    if (val === null) return { type: 'Object' };
    if (typeof val === 'boolean') return { type: 'Boolean' };
    if (typeof val === 'number') return { type: Number.isInteger(val) && Math.abs(val) <= 2147483647 ? 'Integer' : Number.isInteger(val) ? 'Long' : 'Double' };
    if (typeof val === 'string') return { type: 'String' };
    if (Array.isArray(val)) return { type: val.length ? `List<${inferArrayItemType(val, key)}>` : 'List<Object>' };
    if (typeof val === 'object') return { type: inferClass(val, toPascalCase(key)) };
    return { type: 'Object' };
  }

  function inferClass(obj, className) {
    const name = uniqueName(className);
    const fields = [];
    classes.set(name, fields);
    for (const [key, val] of Object.entries(obj)) {
      const camelName = toCamelCase(key);
      const { type } = inferType(val, key);
      fields.push({ name: camelName, type, originalKey: key });
    }
    return name;
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    inferClass(value, rootName);
  } else {
    const { type } = inferType(value, rootName);
    classes.set(uniqueName(rootName), [{ name: 'value', type, originalKey: 'value' }]);
  }

  const allFields = [...classes.values()].flat();
  const needsList = allFields.some(f => f.type.startsWith('List'));
  const lines = [];

  if (packageName) { lines.push(`package ${packageName};`); lines.push(''); }

  const imports = [];
  if (annotationStyle === 'jackson') imports.push('com.fasterxml.jackson.annotation.JsonProperty');
  if (annotationStyle === 'gson')    imports.push('com.google.gson.annotations.SerializedName');
  if (needsList) imports.push('java.util.List');
  if (imports.length) { imports.sort().forEach(i => lines.push(`import ${i};`)); lines.push(''); }

  let first = true;
  for (const [name, fields] of classes) {
    if (!first) lines.push('');
    first = false;
    lines.push(`public class ${name} {`);
    lines.push('');
    for (const f of fields) {
      if (annotationStyle === 'jackson') lines.push(`    @JsonProperty("${f.originalKey}")`);
      if (annotationStyle === 'gson')    lines.push(`    @SerializedName("${f.originalKey}")`);
      lines.push(`    private ${f.type} ${f.name};`);
    }
    if (includeGetters && fields.length) {
      for (const f of fields) {
        const cap = f.name.charAt(0).toUpperCase() + f.name.slice(1);
        const prefix = f.type === 'boolean' ? 'is' : 'get';
        lines.push('');
        lines.push(`    public ${f.type} ${prefix}${cap}() { return ${f.name}; }`);
        lines.push(`    public void set${cap}(${f.type} ${f.name}) { this.${f.name} = ${f.name}; }`);
      }
    }
    lines.push('}');
  }
  return lines.join('\n');
}

let _kotlinParsed = null;
let _kotlinTitleHint = '';
let _convertLang = 'kotlin';

function titleToClassName(hint) {
  const words = (hint || '').replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(w => /[a-zA-Z]/.test(w));
  return words.length ? words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('').slice(0, 32) : 'Root';
}

function reRenderConvert() {
  const out = document.getElementById('kotlin-output');
  out.innerHTML = '';
  let code, filename;

  if (_convertLang === 'kotlin') {
    const rootName     = document.getElementById('kotlin-root-name').value.trim() || 'Root';
    const packageName  = document.getElementById('kotlin-package-name').value.trim();
    const serializable = document.getElementById('kt-toggle-serial').classList.contains('active');
    const allNullable  = document.getElementById('kt-toggle-nullable').classList.contains('active');
    const useVar       = document.getElementById('kt-toggle-var').classList.contains('active');
    code = jsonToKotlin(_kotlinParsed, rootName, { serializable, allNullable, useVar, packageName });
    filename = rootName + '.kt';
    out.appendChild(renderKotlin(code));
  } else if (_convertLang === 'java') {
    const rootName        = document.getElementById('java-root-name').value.trim() || 'Root';
    const packageName     = document.getElementById('java-package-name').value.trim();
    const activeAnn       = document.querySelector('#opts-java [data-ann].active');
    const annotationStyle = activeAnn ? activeAnn.dataset.ann : 'jackson';
    const includeGetters  = document.getElementById('jv-toggle-getters').classList.contains('active');
    code = jsonToJava(_kotlinParsed, rootName, { packageName, annotationStyle, includeGetters });
    filename = rootName + '.java';
    out.appendChild(renderJava(code));
  } else if (_convertLang === 'swift') {
    const rootName    = document.getElementById('swift-root-name').value.trim() || 'Root';
    const packageName = document.getElementById('swift-package-name').value.trim();
    const useCodable  = document.getElementById('sw-toggle-codable').classList.contains('active');
    const useClass    = document.getElementById('sw-toggle-class').classList.contains('active');
    const useVar      = document.getElementById('sw-toggle-var').classList.contains('active');
    code = jsonToSwift(_kotlinParsed, rootName, { useCodable, useClass, useVar, allNullable: false, packageName });
    filename = rootName + '.swift';
    out.appendChild(renderSwift(code));
  } else {
    const rootName    = document.getElementById('flutter-root-name').value.trim() || 'Root';
    const packageName = document.getElementById('flutter-package-name').value.trim();
    const includeJson = document.getElementById('fl-toggle-json').classList.contains('active');
    const useFinal    = document.getElementById('fl-toggle-final').classList.contains('active');
    const allNullable = document.getElementById('fl-toggle-nullable').classList.contains('active');
    code = jsonToFlutter(_kotlinParsed, rootName, { includeJson, useFinal, allNullable, packageName });
    filename = rootName + '.dart';
    out.appendChild(renderFlutter(code));
  }

  document.getElementById('kotlin-meta').textContent = filename;
  document.getElementById('btn-copy-kotlin').onclick = () => {
    navigator.clipboard.writeText(code).then(() => toast('Copied!'));
  };
  document.getElementById('btn-download-kotlin').onclick = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: filename });
    a.click(); URL.revokeObjectURL(a.href);
  };
}

function openKotlin(parsed, titleHint, fromScreen = 'screen-viewer') {
  _kotlinParsed = parsed;
  _kotlinTitleHint = titleHint || '';
  _convertLang = 'kotlin';

  const defaultName = titleToClassName(_kotlinTitleHint);
  ['kotlin', 'java', 'swift', 'flutter'].forEach(l => {
    const el = document.getElementById(`${l}-root-name`);
    if (el) el.value = defaultName;
  });

  document.querySelectorAll('.convert-lang-btn').forEach(b => b.classList.toggle('active', b.dataset.lang === 'kotlin'));
  ['kotlin', 'java', 'swift', 'flutter'].forEach(l => {
    document.getElementById(`opts-${l}`).style.display = l === 'kotlin' ? '' : 'none';
  });
  document.getElementById('convert-screen-title').textContent = 'Kotlin';

  reRenderConvert();
  show('screen-kotlin');
  document.getElementById('btn-back-from-kotlin').onclick = () => show(fromScreen);
}

/* ── VIEWER SEARCH ───────────────────────────────────────────────────── */
const viewerSearch = { matches: [], current: -1 };

function getSearchText(el) {
  const raw = el.textContent;
  if (el.classList.contains('jn-key')) return raw.slice(1, raw.length - 3); // strip `"` and `": `
  if (el.classList.contains('jn-str')) return raw.slice(1, -1);             // strip surrounding `"`
  return raw;
}

function expandToMatch(el) {
  let node = el.parentElement;
  while (node && node.id !== 'json-viewer') {
    if (node.classList.contains('jn-children') && node.classList.contains('collapsed')) {
      node.classList.remove('collapsed');
      const wrap = node.parentElement;
      const toggle = wrap.querySelector(':scope > .jn-toggle');
      if (toggle) toggle.textContent = '▾';
      const summary = wrap.querySelector(':scope > .jn-summary');
      if (summary) summary.style.display = 'none';
    }
    node = node.parentElement;
  }
}

function goToMatch(index) {
  const { matches } = viewerSearch;
  if (!matches.length) return;
  if (viewerSearch.current >= 0) matches[viewerSearch.current].classList.remove('jn-match-active');
  viewerSearch.current = index;
  const el = matches[index];
  el.classList.add('jn-match-active');
  expandToMatch(el);
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  document.getElementById('viewer-search-count').textContent = `${index + 1} / ${matches.length}`;
}

function runViewerSearch(query) {
  document.querySelectorAll('.jn-match, .jn-match-active').forEach(el => el.classList.remove('jn-match', 'jn-match-active'));
  viewerSearch.matches = [];
  viewerSearch.current = -1;
  const countEl = document.getElementById('viewer-search-count');
  if (!query) { countEl.textContent = ''; return; }
  const q = query.toLowerCase();
  const matches = [];
  document.getElementById('json-viewer').querySelectorAll('.jn-key, .jn-str, .jn-num, .jn-bool, .jn-null').forEach(el => {
    if (getSearchText(el).toLowerCase().includes(q)) {
      el.classList.add('jn-match');
      matches.push(el);
    }
  });
  viewerSearch.matches = matches;
  if (!matches.length) { countEl.textContent = 'No match'; return; }
  goToMatch(0);
}

/* ── TOAST ───────────────────────────────────────────────────────────── */
let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2000);
}

/* ── HISTORY LIST ────────────────────────────────────────────────────── */
let _historyOpenEntry = null;
const historyFilter = { search: '', date: 'all' };

function jsonSnippet(raw) {
  try {
    const s = JSON.stringify(JSON.parse(raw));
    return s.length > 100 ? s.slice(0, 100) + '…' : s;
  } catch {
    return raw.trim().slice(0, 100);
  }
}

function groupByDate(entries) {
  const tod = new Date(); tod.setHours(0, 0, 0, 0);
  const yes = new Date(tod); yes.setDate(yes.getDate() - 1);
  const wk  = new Date(tod); wk.setDate(wk.getDate() - 7);
  const fixed = ['Today', 'Yesterday', 'This Week'];
  const groups = new Map();

  entries.forEach(e => {
    let label;
    if      (e.ts >= tod.getTime()) label = 'Today';
    else if (e.ts >= yes.getTime()) label = 'Yesterday';
    else if (e.ts >= wk.getTime()) label = 'This Week';
    else label = new Date(e.ts).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(e);
  });

  const result = [];
  for (const l of fixed) if (groups.has(l)) result.push({ label: l, items: groups.get(l) });
  for (const [l, items] of groups) if (!fixed.includes(l)) result.push({ label: l, items });
  return result;
}

async function renderHistory(openEntry) {
  if (openEntry) _historyOpenEntry = openEntry;
  const cb = _historyOpenEntry;

  const list = document.getElementById('history-list');
  const all  = await dbLoad();

  const tod = new Date(); tod.setHours(0, 0, 0, 0);
  const yes = new Date(tod); yes.setDate(yes.getDate() - 1);
  const wk  = new Date(tod); wk.setDate(wk.getDate() - 7);

  const entries = all.filter(e => {
    if (historyFilter.search && !(e.title || 'Untitled').toLowerCase().includes(historyFilter.search)) return false;
    if (historyFilter.date === 'today')     return e.ts >= tod.getTime();
    if (historyFilter.date === 'yesterday') return e.ts >= yes.getTime() && e.ts < tod.getTime();
    if (historyFilter.date === 'week')      return e.ts >= wk.getTime();
    return true;
  });

  list.innerHTML = '';

  if (!entries.length) {
    list.innerHTML = `<div class="history-empty"><div class="icon">📂</div>No results</div>`;
    return;
  }

  groupByDate(entries).forEach(({ label, items }) => {
    const grp = document.createElement('div');
    grp.innerHTML = `<div class="date-group-label">${label}</div>`;
    items.forEach(entry => {
      const item = document.createElement('div');
      item.className = 'history-item';
      item.innerHTML = `
        <div class="history-item-header">
          <div class="history-item-title">${esc(entry.title || 'Untitled')}</div>
          <button class="history-item-del" title="Delete">✕</button>
        </div>
        <div class="history-snippet">${esc(jsonSnippet(entry.raw))}</div>
        <div class="history-item-footer">
          <span class="history-item-time">${relTime(entry.ts)}</span>
          <span class="history-item-size">${entry.size}</span>
        </div>
      `;
      item.querySelector('.history-item-del').addEventListener('click', async e => {
        e.stopPropagation();
        await dbDelete(entry.id);
        renderHistory();
      });
      item.addEventListener('click', () => cb(entry));
      grp.appendChild(item);
    });
    list.appendChild(grp);
  });
}

function esc(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function jsonSize(str) {
  const bytes = new TextEncoder().encode(str).length;
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

/* ── VIEWER ──────────────────────────────────────────────────────────── */
function openViewer(entry, fromHistory = false) {
  document.getElementById('viewer-title').textContent = entry.title || 'Untitled';
  document.getElementById('viewer-meta').textContent =
    `${relTime(entry.ts)} · ${entry.size}`;

  const viewer = document.getElementById('json-viewer');
  viewer.innerHTML = '';

  document.getElementById('viewer-search-input').value = '';
  document.getElementById('viewer-search-count').textContent = '';
  viewerSearch.matches = [];
  viewerSearch.current = -1;

  let parsed;
  try { parsed = JSON.parse(entry.raw); } catch { viewer.textContent = entry.raw; return; }

  viewer.appendChild(renderTree(parsed));
  show('screen-viewer');

  // back button: go to history if opened from there, else input
  document.getElementById('btn-back-to-input').onclick = () => {
    if (fromHistory) {
      renderHistory(e => openViewer(e, true));
      show('screen-history');
    } else {
      show('screen-input');
    }
  };

  // copy
  document.getElementById('btn-copy').onclick = () => {
    navigator.clipboard.writeText(JSON.stringify(parsed, null, 2)).then(() => toast('Copied!'));
  };

  // kotlin
  document.getElementById('btn-kotlin').onclick = () => openKotlin(parsed, entry.title, 'screen-viewer');
}

/* ── INIT ────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const jsonInput  = document.getElementById('json-input');
  const titleInput = document.getElementById('title-input');
  const errorMsg   = document.getElementById('error-msg');

  /* ---- Theme ---- */
  loadTheme().then(applyTheme);
  document.querySelectorAll('.btn-theme').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });

  /* ---- Input screen ---- */
  document.getElementById('btn-format').addEventListener('click', async () => {
    const raw = jsonInput.value.trim();
    if (!raw) return;

    let parsed;
    let finalRaw = raw;
    let wasRepaired = false;

    try {
      parsed = JSON.parse(raw);
    } catch {
      const repaired = repairJSON(raw);
      try {
        parsed = JSON.parse(repaired);
        finalRaw = repaired;
        wasRepaired = true;
        jsonInput.value = repaired;
      } catch {
        errorMsg.classList.add('show');
        return;
      }
    }

    errorMsg.classList.remove('show');

    const entry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2),
      title: titleInput.value.trim() || autoTitle(parsed),
      raw: finalRaw,
      size: jsonSize(finalRaw),
      ts: Date.now(),
    };

    await dbAdd(entry);
    if (wasRepaired) toast('Auto-repaired & formatted');
    openViewer(entry, false);
  });

  document.getElementById('btn-clear').addEventListener('click', () => {
    jsonInput.value = '';
    titleInput.value = '';
    errorMsg.classList.remove('show');
  });

  function openHistory() {
    // reset filters each time history is opened
    historyFilter.search = '';
    historyFilter.date   = 'all';
    document.getElementById('history-search').value = '';
    document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.date-filter-btn[data-filter="all"]').classList.add('active');
    renderHistory(e => openViewer(e, true));
    show('screen-history');
  }

  document.getElementById('btn-open-history').addEventListener('click', openHistory);

  /* ---- Viewer screen ---- */
  document.getElementById('btn-open-history2').addEventListener('click', openHistory);

  /* ---- Kotlin from input screen ---- */
  document.getElementById('btn-to-kotlin').addEventListener('click', () => {
    const raw = jsonInput.value.trim();
    if (!raw) return;
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const repaired = repairJSON(raw);
      try { parsed = JSON.parse(repaired); } catch { errorMsg.classList.add('show'); return; }
    }
    errorMsg.classList.remove('show');
    openKotlin(parsed, titleInput.value.trim() || autoTitle(parsed), 'screen-input');
  });

  document.getElementById('kotlin-root-name').addEventListener('input', reRenderConvert);
  document.getElementById('kotlin-package-name').addEventListener('input', reRenderConvert);
  document.querySelectorAll('#opts-kotlin .kotlin-toggle').forEach(btn => {
    btn.addEventListener('click', () => { btn.classList.toggle('active'); reRenderConvert(); });
  });

  /* ---- Java options ---- */
  document.getElementById('java-root-name').addEventListener('input', reRenderConvert);
  document.getElementById('java-package-name').addEventListener('input', reRenderConvert);
  document.querySelectorAll('[data-ann]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ann]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      reRenderConvert();
    });
  });
  document.getElementById('jv-toggle-getters').addEventListener('click', () => {
    document.getElementById('jv-toggle-getters').classList.toggle('active');
    reRenderConvert();
  });

  /* ---- Language tabs ---- */
  const langLabels = { kotlin: 'Kotlin', java: 'Java', swift: 'Swift', flutter: 'Flutter' };
  document.querySelectorAll('.convert-lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _convertLang = btn.dataset.lang;
      document.querySelectorAll('.convert-lang-btn').forEach(b => b.classList.toggle('active', b === btn));
      ['kotlin', 'java', 'swift', 'flutter'].forEach(l => {
        document.getElementById(`opts-${l}`).style.display = l === _convertLang ? '' : 'none';
      });
      document.getElementById('convert-screen-title').textContent = langLabels[_convertLang] || _convertLang;
      reRenderConvert();
    });
  });

  /* ---- Swift options ---- */
  document.getElementById('swift-root-name').addEventListener('input', reRenderConvert);
  document.getElementById('swift-package-name').addEventListener('input', reRenderConvert);
  ['sw-toggle-codable', 'sw-toggle-class', 'sw-toggle-var'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById(id).classList.toggle('active');
      reRenderConvert();
    });
  });

  /* ---- Flutter options ---- */
  document.getElementById('flutter-root-name').addEventListener('input', reRenderConvert);
  document.getElementById('flutter-package-name').addEventListener('input', reRenderConvert);
  ['fl-toggle-json', 'fl-toggle-final', 'fl-toggle-nullable'].forEach(id => {
    document.getElementById(id).addEventListener('click', () => {
      document.getElementById(id).classList.toggle('active');
      reRenderConvert();
    });
  });

  /* ---- Viewer search ---- */
  const searchInput = document.getElementById('viewer-search-input');
  searchInput.addEventListener('input', e => runViewerSearch(e.target.value.trim()));
  searchInput.addEventListener('keydown', e => {
    const { matches, current } = viewerSearch;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!matches.length) return;
      goToMatch(e.shiftKey ? (current - 1 + matches.length) % matches.length : (current + 1) % matches.length);
    } else if (e.key === 'Escape') {
      searchInput.value = '';
      runViewerSearch('');
    }
  });
  document.getElementById('btn-search-prev').addEventListener('click', () => {
    const { matches, current } = viewerSearch;
    if (matches.length) goToMatch((current - 1 + matches.length) % matches.length);
  });
  document.getElementById('btn-search-next').addEventListener('click', () => {
    const { matches, current } = viewerSearch;
    if (matches.length) goToMatch((current + 1) % matches.length);
  });

  /* ---- History screen ---- */
  document.getElementById('btn-back-from-history').addEventListener('click', () => {
    show('screen-input');
  });

  document.getElementById('btn-clear-all').addEventListener('click', async () => {
    if (confirm('Clear all history?')) {
      await dbClear();
      renderHistory();
    }
  });

  document.getElementById('history-search').addEventListener('input', e => {
    historyFilter.search = e.target.value.trim().toLowerCase();
    renderHistory();
  });

  document.querySelectorAll('.date-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      historyFilter.date = btn.dataset.filter;
      renderHistory();
    });
  });

  /* ---- Inline error clear ---- */
  jsonInput.addEventListener('input', () => errorMsg.classList.remove('show'));
});

function autoTitle(parsed) {
  if (Array.isArray(parsed)) return `Array [${parsed.length}]`;
  const keys = Object.keys(parsed);
  const hint = ['name','title','id','type','event','action'].find(k => parsed[k]);
  return hint ? String(parsed[hint]).slice(0, 32) : `Object {${keys.slice(0,3).join(', ')}}`;
}
