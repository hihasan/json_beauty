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

  function build(val, key, parent) {
    const wrap = document.createElement('div');

    const keySpan = key !== null
      ? Object.assign(document.createElement('span'), { className: 'jn-key', textContent: `"${key}": ` })
      : null;

    if (val === null) {
      if (keySpan) wrap.appendChild(keySpan);
      wrap.appendChild(Object.assign(document.createElement('span'), { className: 'jn-null', textContent: 'null' }));
    } else if (typeof val === 'boolean') {
      if (keySpan) wrap.appendChild(keySpan);
      wrap.appendChild(Object.assign(document.createElement('span'), { className: 'jn-bool', textContent: String(val) }));
    } else if (typeof val === 'number') {
      if (keySpan) wrap.appendChild(keySpan);
      wrap.appendChild(Object.assign(document.createElement('span'), { className: 'jn-num', textContent: String(val) }));
    } else if (typeof val === 'string') {
      if (keySpan) wrap.appendChild(keySpan);
      wrap.appendChild(Object.assign(document.createElement('span'), { className: 'jn-str', textContent: `"${escapeStr(val)}"` }));
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

    // toggle arrow
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
      val.forEach(item => build(item, null, children));
    } else {
      Object.entries(val).forEach(([k, v]) => build(v, k, children));
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

  function escapeStr(s) {
    return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  build(value, null, container);
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
