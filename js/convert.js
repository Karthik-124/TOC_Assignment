/* ══════════════════════════════════════════════════════════
   convert.js — NFA→DFA Conversion Tab Logic
   ══════════════════════════════════════════════════════════ */

'use strict';

const ConvertPanel = (() => {
  let steps = [];
  let currentStep = -1;
  let dfa = null;
  let dfaRenderer = null;

  // DOM refs
  const getEl = (id) => document.getElementById(id);

  function init() {
    getEl('step-next-btn').addEventListener('click', nextStep);
    getEl('step-back-btn').addEventListener('click', prevStep);
    getEl('run-all-btn').addEventListener('click', runAll);
    getEl('go-minimize-btn').addEventListener('click', () => {
      if (!dfa) { UI.toast('Please complete the conversion first.', 'error'); return; }
      UI.switchTab('minimize');
      MinimizePanel.prepare(dfa);
    });
    getEl('dfa-fit-btn').addEventListener('click', () => dfaRenderer?.fitView());

    // Init DFA canvas renderer
    const canvas = getEl('dfa-canvas');
    dfaRenderer = new GraphRenderer(canvas);
  }

  function prepare(nfa) {
    // Run subset construction
    const result = subsetConstruction(nfa);
    if (result.error) { UI.toast(result.error, 'error'); return; }

    steps = result.steps;
    dfa = result.dfa;
    currentStep = -1;

    // Reset UI
    getEl('step-log').innerHTML = '';
    getEl('subset-table-container').innerHTML = '<div class="empty-table-hint">Run the conversion to see the transition table</div>';
    getEl('step-counter').textContent = 'Step 0';
    getEl('step-back-btn').disabled = true;
    getEl('step-next-btn').disabled = false;
    getEl('go-minimize-btn').disabled = true;

    const hint = getEl('dfa-canvas-hint');
    if (hint) hint.classList.remove('hidden');
    dfaRenderer.setAutomaton(null);

    // Rebuild DFA for display (start with empty, fill as steps progress)
    _dfaForDisplay = new DFA();
    _dfaForDisplay.alphabet = new Set(dfa.alphabet);

    UI.toast(`NFA ready! ${steps.length} steps to convert. Click "Next Step" to begin.`, 'info');
  }

  let _dfaForDisplay = null;

  function nextStep() {
    if (currentStep >= steps.length - 1) return;
    currentStep++;
    applyStep(currentStep);
    updateButtons();
  }

  function prevStep() {
    if (currentStep <= 0) return;
    currentStep--;
    // Rebuild up to currentStep
    rebuildToStep(currentStep);
    updateButtons();
  }

  function runAll() {
    // Jump to end
    currentStep = steps.length - 1;
    rebuildToStep(currentStep);
    updateButtons();
    // Scroll log to bottom
    const log = getEl('step-log');
    log.scrollTop = log.scrollHeight;
  }

  function rebuildToStep(targetStep) {
    const log = getEl('step-log');
    log.innerHTML = '';
    _dfaForDisplay = new DFA();
    _dfaForDisplay.alphabet = new Set(dfa.alphabet);

    for (let i = 0; i <= targetStep; i++) {
      _addLogEntry(steps[i], i === targetStep);
      _applyStepToDFA(steps[i]);
    }

    _updateSubsetTable();
    _refreshDFACanvas();
    getEl('step-counter').textContent = `Step ${targetStep + 1} / ${steps.length}`;

    if (targetStep === steps.length - 1) {
      getEl('go-minimize-btn').disabled = false;
    }
  }

  function applyStep(stepIdx) {
    _addLogEntry(steps[stepIdx], true);
    // Mark previous entry as not active
    const log = getEl('step-log');
    const entries = log.querySelectorAll('.step-entry');
    entries.forEach((e, i) => {
      e.classList.toggle('step-active', i === entries.length - 1);
    });

    _applyStepToDFA(steps[stepIdx]);
    _updateSubsetTable();
    _refreshDFACanvas();
    getEl('step-counter').textContent = `Step ${stepIdx + 1} / ${steps.length}`;
    log.scrollTop = log.scrollHeight;

    if (stepIdx === steps.length - 1) {
      getEl('go-minimize-btn').disabled = false;
      UI.toast('Conversion complete! 🎉 You can now minimise the DFA.', 'success');
    }
  }

  function _applyStepToDFA(step) {
    if (!_dfaForDisplay) return;

    if (step.type === 'init' || step.type === 'process') {
      // Add state if not yet
      const label = _extractLabel(step);
      if (label && !_dfaForDisplay.states.has(label)) {
        const dfaState = dfa.states.get(label);
        if (dfaState) _dfaForDisplay.addState(label, { ...dfaState });
      }
    }
    if (step.type === 'transition') {
      // Parse from/to from step label "δ(X, sym) = Y"
      const match = step.label.match(/δ\((.+),\s*(.+)\)\s*=\s*(.+)/);
      if (match) {
        const [, from, sym, to] = match;
        if (to !== '∅') {
          if (!_dfaForDisplay.states.has(from)) {
            const dfaState = dfa.states.get(from);
            if (dfaState) _dfaForDisplay.addState(from, { ...dfaState });
          }
          if (!_dfaForDisplay.states.has(to)) {
            const dfaState = dfa.states.get(to);
            if (dfaState) _dfaForDisplay.addState(to, { ...dfaState });
          }
          _dfaForDisplay.addTransition(from, sym.trim(), to);
        }
      }
    }
    if (step.type === 'done') {
      // Sync fully — use transitionList so comma-containing names like {q0,q1} stay intact
      dfa.states.forEach((s, k) => {
        if (!_dfaForDisplay.states.has(k)) _dfaForDisplay.addState(k, { ...s });
      });
      dfa.transitionList.forEach(({ from, symbol, to }) => {
        _dfaForDisplay.addTransition(from, symbol, to);
      });
    }
  }

  function _extractLabel(step) {
    if (step.highlight) return step.highlight;
    return null;
  }

  function _addLogEntry(step, isActive) {
    const log = getEl('step-log');
    const div = document.createElement('div');
    div.className = `step-entry${isActive ? ' step-active' : ''}`;
    div.innerHTML = `
      <div class="step-dot"></div>
      <div class="step-content">
        <span class="step-label">${escHtml(step.label)}</span>
        <p>${step.msg}</p>
      </div>
    `;
    log.appendChild(div);
  }

  function _updateSubsetTable() {
    const container = getEl('subset-table-container');
    const symbols = [...dfa.alphabet];
    const processedStates = [..._dfaForDisplay.states.keys()];

    if (processedStates.length === 0) {
      container.innerHTML = '<div class="empty-table-hint">Run the conversion to see the transition table</div>';
      return;
    }

    let html = '<table class="subset-table"><thead><tr>';
    html += '<th>DFA State</th><th>NFA States</th><th>Accept?</th>';
    symbols.forEach(s => html += `<th>${escHtml(s)}</th>`);
    html += '</tr></thead><tbody>';

    for (const stateName of processedStates) {
      const state = _dfaForDisplay.states.get(stateName);
      const nfaStates = state.nfaStates ? [...state.nfaStates].join(', ') : stateName;
      const isNew = stateName === steps[currentStep]?.highlight;
      html += `<tr>`;
      html += `<td class="td-state${isNew ? ' td-new' : ''}">${escHtml(stateName)}</td>`;
      html += `<td>${escHtml(nfaStates)}</td>`;
      html += `<td class="${state.isAccept ? 'td-accept' : ''}">${state.isAccept ? '✓' : '—'}</td>`;
      symbols.forEach(sym => {
        const target = _dfaForDisplay.getTransition(stateName, sym) ?? '—';
        html += `<td>${escHtml(target)}</td>`;
      });
      html += `</tr>`;
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  function _refreshDFACanvas() {
    if (!_dfaForDisplay || _dfaForDisplay.states.size === 0) return;
    const hint = getEl('dfa-canvas-hint');
    if (hint) hint.classList.add('hidden');
    dfaRenderer.setAutomaton(_dfaForDisplay);

    // Highlight current step's state
    if (steps[currentStep]?.highlight) {
      dfaRenderer.setHighlightedStates(new Set([steps[currentStep].highlight]));
    } else {
      dfaRenderer.setHighlightedStates(new Set());
    }
  }

  function updateButtons() {
    getEl('step-back-btn').disabled = currentStep <= 0;
    getEl('step-next-btn').disabled = currentStep >= steps.length - 1;
  }

  function getDFA() { return dfa; }

  return { init, prepare, getDFA };
})();

window.ConvertPanel = ConvertPanel;

function escHtml(str) {
  if (typeof str !== 'string') return str ?? '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
