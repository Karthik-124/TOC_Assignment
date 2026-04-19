/* ══════════════════════════════════════════════════════════
   ui.js — Main UI Controller & NFA Builder
   ══════════════════════════════════════════════════════════ */

'use strict';

// ── Global NFA instance ───────────────────────────────────
const globalNFA = new NFA();
let nfaRenderer = null;
let stateCounter = 0;
let edgeDialogCallback = null;
let selectedEdgeSymbols = new Set();

// ── UI Module ─────────────────────────────────────────────
const UI = {
  switchTab(tabId) {
    document.querySelectorAll('.tab-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
      b.setAttribute('aria-selected', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(p => {
      p.classList.toggle('active', p.id === `panel-${tabId}`);
    });
  },

  toast(message, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✗', info: '◈' };
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span class="toast-icon">${icons[type] || '◈'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('removing');
      toast.addEventListener('animationend', () => toast.remove());
    }, duration);
  }
};

// ── Initialization ────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initNFABuilder();
  initAlphabet();
  ConvertPanel.init();
  MinimizePanel.init();
  TesterPanel.init();
  loadExample(); // Load a default example on startup
});

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => UI.switchTab(btn.dataset.tab));
  });
}

// ── NFA Builder ───────────────────────────────────────────
function initNFABuilder() {
  // Canvas setup
  const canvas = document.getElementById('nfa-canvas');
  nfaRenderer = new GraphRenderer(canvas, { editable: true });
  nfaRenderer.setAutomaton(globalNFA);
  nfaRenderer.enableInteraction({
    onAddState: (x, y) => {
      if (nfaRenderer.mode !== 'addstate' && nfaRenderer.mode !== 'select') return;
      const name = `q${stateCounter++}`;
      globalNFA.addState(name, { isStart: globalNFA.states.size === 0, isAccept: false, x, y });
      _refreshBuilderUI();
      hideCanvasHint();
    },
    onAddEdge: (from, to) => {
      showEdgeDialog(from, to);
    },
    onStateOptions: (name) => {
      showStateContextMenu(name);
    }
  });

  // Tool buttons
  document.getElementById('tool-select').addEventListener('click', () => setTool('select'));
  document.getElementById('tool-addstate').addEventListener('click', () => setTool('addstate'));
  document.getElementById('tool-edge').addEventListener('click', () => setTool('edge'));
  document.getElementById('clear-canvas-btn').addEventListener('click', clearAll);

  // Sidebar controls
  document.getElementById('add-state-btn').addEventListener('click', addStateFromSidebar);
  document.getElementById('state-name-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addStateFromSidebar();
  });
  document.getElementById('add-trans-btn').addEventListener('click', addTransitionFromSidebar);

  // Example buttons
  document.getElementById('load-example-btn').addEventListener('click', loadExample);
  document.getElementById('load-example-hint-btn').addEventListener('click', loadExample);
  document.getElementById('go-convert-btn').addEventListener('click', goConvert);

  // Edge dialog
  document.getElementById('edge-dialog-cancel').addEventListener('click', closeEdgeDialog);
  document.getElementById('edge-dialog-confirm').addEventListener('click', confirmEdgeDialog);
  document.getElementById('edge-dialog-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('edge-dialog-overlay')) closeEdgeDialog();
  });
}

function setTool(mode) {
  nfaRenderer.setMode(mode);
  document.querySelectorAll('.tool-btn[id^="tool-"]').forEach(b => {
    b.classList.toggle('active', b.id === `tool-${mode}`);
  });
  const wrapper = document.getElementById('nfa-canvas-wrapper');
  wrapper.className = 'canvas-wrapper mode-' + mode;
}

function addStateFromSidebar() {
  const input = document.getElementById('state-name-input');
  const name = input.value.trim() || `q${stateCounter}`;
  if (!name) { UI.toast('Enter a state name.', 'error'); return; }
  if (globalNFA.states.has(name)) { UI.toast(`State "${name}" already exists.`, 'error'); return; }

  // Position in a nice layout
  const n = globalNFA.states.size;
  const W = document.getElementById('nfa-canvas').clientWidth || 700;
  const H = document.getElementById('nfa-canvas').clientHeight || 360;
  const x = 100 + (n % 4) * (W - 140) / 3;
  const y = 80 + Math.floor(n / 4) * 120;

  globalNFA.addState(name, {
    isStart: globalNFA.states.size === 0,
    isAccept: false,
    x: Math.min(x, W - 60),
    y: Math.min(y, H - 60)
  });
  stateCounter = Math.max(stateCounter, parseInt(name.replace(/\D/g, '')) + 1) || stateCounter + 1;
  input.value = '';
  _refreshBuilderUI();
  hideCanvasHint();
  UI.toast(`Added state "${name}"`, 'success');
}

function addTransitionFromSidebar() {
  const from = document.getElementById('trans-from').value;
  const symbol = document.getElementById('trans-symbol').value;
  const toSelect = document.getElementById('trans-to');
  const toStates = [...toSelect.selectedOptions].map(o => o.value);

  if (!from || !symbol || toStates.length === 0) {
    UI.toast('Select from state, symbol, and at least one target state.', 'error');
    return;
  }

  toStates.forEach(to => globalNFA.addTransition(from, symbol, to));
  _refreshBuilderUI();
  UI.toast(`Added transition(s) from ${from} on '${symbol}'`, 'success');
}

function showStateContextMenu(stateName) {
  const state = globalNFA.states.get(stateName);
  if (!state) return;

  // Simple inline actions
  const options = [
    { label: state.isStart ? '✓ Start (click to unset via another)' : '→ Set as Start', action: 'start' },
    { label: state.isAccept ? '✓ Accept → Remove Accept' : '◎ Toggle Accept', action: 'accept' },
    { label: '✕ Delete State', action: 'delete', danger: true }
  ];

  // Create a small floating menu
  const existing = document.getElementById('state-ctx-menu');
  if (existing) existing.remove();

  const stateEl = globalNFA.states.get(stateName);
  const canvasRect = document.getElementById('nfa-canvas').getBoundingClientRect();

  const menu = document.createElement('div');
  menu.id = 'state-ctx-menu';
  menu.style.cssText = `
    position: fixed;
    left: ${canvasRect.left + stateEl.x + 35}px;
    top: ${canvasRect.top + stateEl.y - 20}px;
    background: #13131f;
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 10px;
    padding: 6px;
    z-index: 500;
    min-width: 180px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.6);
    animation: dialogIn 0.2s ease;
  `;

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.style.cssText = `
      display: block; width: 100%; text-align: left;
      padding: 8px 12px; background: none; border: none;
      border-radius: 6px; cursor: pointer;
      font-family: inherit; font-size: 0.82rem;
      color: ${opt.danger ? 'var(--red)' : 'var(--text-primary)'};
      transition: background 0.15s;
    `;
    btn.textContent = opt.label;
    btn.onmouseenter = () => btn.style.background = opt.danger ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.06)';
    btn.onmouseleave = () => btn.style.background = 'none';
    btn.addEventListener('click', () => {
      menu.remove();
      if (opt.action === 'start') { globalNFA.setStart(stateName); _refreshBuilderUI(); UI.toast(`${stateName} set as start state`, 'success'); }
      if (opt.action === 'accept') { globalNFA.toggleAccept(stateName); _refreshBuilderUI(); }
      if (opt.action === 'delete') { globalNFA.removeState(stateName); _refreshBuilderUI(); }
    });
    menu.appendChild(btn);
  });

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 100);
}

function showEdgeDialog(from, to) {
  const overlay = document.getElementById('edge-dialog-overlay');
  const desc = document.getElementById('edge-dialog-desc');
  const chipsContainer = document.getElementById('edge-symbol-chips');

  desc.textContent = `Add transition: ${from} → ${to}`;
  selectedEdgeSymbols = new Set();

  const symbols = [...globalNFA.alphabet, 'ε'];
  chipsContainer.innerHTML = '';
  symbols.forEach(sym => {
    const chip = document.createElement('button');
    chip.className = 'sym-chip';
    chip.textContent = sym;
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      if (chip.classList.contains('selected')) selectedEdgeSymbols.add(sym);
      else selectedEdgeSymbols.delete(sym);
    });
    chipsContainer.appendChild(chip);
  });

  overlay.style.display = 'flex';
  edgeDialogCallback = () => {
    if (selectedEdgeSymbols.size === 0) { UI.toast('Select at least one symbol.', 'error'); return; }
    selectedEdgeSymbols.forEach(sym => globalNFA.addTransition(from, sym, to));
    _refreshBuilderUI();
    UI.toast(`Added transition(s) from ${from} on '${[...selectedEdgeSymbols].join(', ')}'`, 'success');
  };
}

function closeEdgeDialog() {
  document.getElementById('edge-dialog-overlay').style.display = 'none';
  edgeDialogCallback = null;
}

function confirmEdgeDialog() {
  if (edgeDialogCallback) edgeDialogCallback();
  closeEdgeDialog();
}

function _refreshBuilderUI() {
  _updateStatesList();
  _updateTransitionsList();
  _updateStateSelects();
  nfaRenderer.setAutomaton(globalNFA);
  if (globalNFA.states.size > 0) hideCanvasHint();
}

function _updateStatesList() {
  const list = document.getElementById('states-list');
  list.innerHTML = '';

  globalNFA.states.forEach((state, name) => {
    const div = document.createElement('div');
    div.className = 'state-item';
    div.innerHTML = `
      <span class="state-name">${escHtml(name)}</span>
      ${state.isStart ? '<span class="state-badge badge-start">Start</span>' : ''}
      ${state.isAccept ? '<span class="state-badge badge-accept">Accept</span>' : ''}
      <div class="state-actions">
        <button class="icon-btn" title="Set start" data-action="start" data-state="${name}">▶</button>
        <button class="icon-btn" title="Toggle accept" data-action="accept" data-state="${name}">◎</button>
        <button class="icon-btn danger" title="Delete" data-action="delete" data-state="${name}">✕</button>
      </div>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const state = btn.dataset.state;
      if (action === 'start') { globalNFA.setStart(state); _refreshBuilderUI(); }
      if (action === 'accept') { globalNFA.toggleAccept(state); _refreshBuilderUI(); }
      if (action === 'delete') { globalNFA.removeState(state); _refreshBuilderUI(); }
    });
  });
}

function _updateTransitionsList() {
  const list = document.getElementById('transitions-list');
  list.innerHTML = '';

  globalNFA.transitions.forEach((t, i) => {
    const div = document.createElement('div');
    div.className = 'transition-item';
    div.innerHTML = `
      <span class="trans-from">${escHtml(t.from)}</span>
      <span class="trans-sym">${escHtml(t.symbol)}</span>
      <span class="trans-arrow">→</span>
      <span class="trans-to">${escHtml(t.to)}</span>
      <button class="icon-btn danger trans-del" data-idx="${i}">✕</button>
    `;
    list.appendChild(div);
  });

  list.querySelectorAll('[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      const t = globalNFA.transitions[idx];
      if (t) globalNFA.removeTransition(t.from, t.symbol, t.to);
      _refreshBuilderUI();
    });
  });
}

function _updateStateSelects() {
  const stateNames = [...globalNFA.states.keys()];
  const symbols = [...globalNFA.alphabet, 'ε'];

  const fromSel = document.getElementById('trans-from');
  const symSel = document.getElementById('trans-symbol');
  const toSel = document.getElementById('trans-to');

  const setOptions = (sel, opts, multi = false) => {
    const prev = multi ? [...sel.selectedOptions].map(o => o.value) : [sel.value];
    sel.innerHTML = opts.map(o => `<option value="${escHtml(o)}">${escHtml(o)}</option>`).join('');
    opts.forEach((o, i) => { if (prev.includes(o)) sel.options[i].selected = true; });
  };

  setOptions(fromSel, stateNames);
  setOptions(symSel, symbols);
  setOptions(toSel, stateNames, true);
}

// ── Alphabet ──────────────────────────────────────────────
function initAlphabet() {
  document.getElementById('set-alphabet-btn').addEventListener('click', updateAlphabet);
  document.getElementById('alphabet-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') updateAlphabet();
  });
  updateAlphabet();
}

function updateAlphabet() {
  const raw = document.getElementById('alphabet-input').value;
  const syms = raw.split(',').map(s => s.trim()).filter(s => s.length > 0 && s !== 'ε' && s !== 'eps');

  globalNFA.alphabet = new Set(syms);
  _updateAlphabetPreview(syms);
  _updateStateSelects();
  UI.toast(`Alphabet set: {${syms.join(', ')}, ε}`, 'success');
}

function _updateAlphabetPreview(syms) {
  const preview = document.getElementById('alphabet-preview');
  const aleph = [...syms].map(s => `<span class="alpha-chip">${escHtml(s)}</span>`).join('');
  preview.innerHTML = aleph + '<span class="alpha-chip epsilon">ε</span>';
}

// ── Example ───────────────────────────────────────────────
function loadExample() {
  globalNFA.states.clear();
  globalNFA.transitions = [];
  stateCounter = 0;

  document.getElementById('alphabet-input').value = 'a, b';
  globalNFA.alphabet = new Set(['a', 'b']);
  _updateAlphabetPreview(['a', 'b']);

  const msg = loadExampleNFA(globalNFA);
  stateCounter = globalNFA.states.size;

  _refreshBuilderUI();
  hideCanvasHint();
  UI.toast(msg, 'success');
}

// ── Convert ───────────────────────────────────────────────
function goConvert() {
  const errors = globalNFA.validate();
  if (errors.length > 0) {
    UI.toast(errors[0], 'error');
    return;
  }

  UI.switchTab('convert');
  ConvertPanel.prepare(globalNFA);
}

// ── Canvas Hint ───────────────────────────────────────────
function hideCanvasHint() {
  const hint = document.getElementById('canvas-hint');
  if (hint) hint.classList.add('hidden');
}

// ── Clear ─────────────────────────────────────────────────
function clearAll() {
  if (!confirm('Clear all states and transitions?')) return;
  globalNFA.states.clear();
  globalNFA.transitions = [];
  stateCounter = 0;
  _refreshBuilderUI();
  document.getElementById('canvas-hint').classList.remove('hidden');
  UI.toast('Cleared.', 'info');
}

window.UI = UI;
