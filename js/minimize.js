/* ══════════════════════════════════════════════════════════
   minimize.js — DFA Minimization Panel Logic
   ══════════════════════════════════════════════════════════ */

'use strict';

const MinimizePanel = (() => {
  let steps = [];
  let currentStep = -1;
  let minDfa = null;
  let equivClasses = [];
  let marked = null;
  let stateNames = [];
  let sourceDfa = null;
  let minDfaRenderer = null;

  const getEl = (id) => document.getElementById(id);
  let _markedSoFar = new Set();

  function init() {
    getEl('min-step-next-btn').addEventListener('click', nextStep);
    getEl('min-step-back-btn').addEventListener('click', prevStep);
    getEl('min-run-all-btn').addEventListener('click', runAll);
    getEl('go-test-btn').addEventListener('click', () => {
      if (!minDfa) { UI.toast('Please complete the minimization first.', 'error'); return; }
      UI.switchTab('test');
      TesterPanel.prepare(sourceDfa, minDfa);
    });
    getEl('min-dfa-fit-btn').addEventListener('click', () => minDfaRenderer?.fitView());

    const canvas = getEl('min-dfa-canvas');
    minDfaRenderer = new GraphRenderer(canvas);
  }

  function prepare(dfa) {
    sourceDfa = dfa;
    const result = minimizeDFA(dfa);
    steps = result.steps;
    minDfa = result.minDfa;
    equivClasses = result.equivClasses;
    marked = result.marked;
    stateNames = result.stateNames;
    currentStep = -1;
    _markedSoFar = new Set();

    // Reset UI
    getEl('min-step-log').innerHTML = '';
    getEl('min-table-container').innerHTML = '<div class="empty-table-hint">Run minimization to see the table</div>';
    getEl('equiv-classes-container').innerHTML = '<div class="empty-table-hint">Equivalent state groups will appear here</div>';
    getEl('min-step-counter').textContent = 'Step 0';
    getEl('min-step-back-btn').disabled = true;
    getEl('min-step-next-btn').disabled = false;
    getEl('go-test-btn').disabled = true;

    const hint = getEl('min-dfa-canvas-hint');
    if (hint) hint.classList.remove('hidden');
    minDfaRenderer.setAutomaton(null);

    UI.toast(`DFA loaded (${dfa.states.size} states). Click "Next Step" to begin minimization.`, 'info');
  }

  function nextStep() {
    if (currentStep >= steps.length - 1) return;
    currentStep++;
    applyStep(currentStep);
    updateButtons();
  }

  function prevStep() {
    if (currentStep <= 0) return;
    currentStep--;
    rebuildToStep(currentStep);
    updateButtons();
  }

  function runAll() {
    currentStep = steps.length - 1;
    rebuildToStep(currentStep);
    updateButtons();
    getEl('min-step-log').scrollTop = getEl('min-step-log').scrollHeight;
  }

  function rebuildToStep(targetStep) {
    const log = getEl('min-step-log');
    log.innerHTML = '';
    _markedSoFar = new Set();

    for (let i = 0; i <= targetStep; i++) {
      _addLogEntry(steps[i], i === targetStep);
      _applyMarking(steps[i]);
    }

    _updateDistTable();
    _updateEquivClasses(targetStep);
    _refreshMinDFACanvas(targetStep);
    getEl('min-step-counter').textContent = `Step ${targetStep + 1} / ${steps.length}`;

    if (targetStep === steps.length - 1) getEl('go-test-btn').disabled = false;
  }

  function applyStep(stepIdx) {
    _addLogEntry(steps[stepIdx], true);
    const log = getEl('min-step-log');
    log.querySelectorAll('.step-entry').forEach((e, i, arr) => {
      e.classList.toggle('step-active', i === arr.length - 1);
    });

    _applyMarking(steps[stepIdx]);
    _updateDistTable();
    _updateEquivClasses(stepIdx);
    _refreshMinDFACanvas(stepIdx);
    getEl('min-step-counter').textContent = `Step ${stepIdx + 1} / ${steps.length}`;
    log.scrollTop = log.scrollHeight;

    if (stepIdx === steps.length - 1) {
      getEl('go-test-btn').disabled = false;
      UI.toast('Minimization complete! 🎉 Ready to test strings.', 'success');
    }
  }

  function _applyMarking(step) {
    if (step.markedPairs) {
      step.markedPairs.forEach(([a, b]) => {
        _markedSoFar.add(_pairKey(a, b));
      });
    }
  }

  function _pairKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

  function _addLogEntry(step, isActive) {
    const log = getEl('min-step-log');
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

  function _updateDistTable() {
    if (!stateNames || stateNames.length === 0) return;
    const container = getEl('min-table-container');
    const n = stateNames.length;

    let html = '<table class="subset-table"><thead><tr><th></th>';
    for (let j = 0; j < n - 1; j++) html += `<th>${escHtml(stateNames[j])}</th>`;
    html += '</tr></thead><tbody>';

    for (let i = 1; i < n; i++) {
      html += `<tr><td class="td-state">${escHtml(stateNames[i])}</td>`;
      for (let j = 0; j < i; j++) {
        const pk = _pairKey(stateNames[i], stateNames[j]);
        const isMarkedNow = _markedSoFar.has(pk);
        const isMarkedFinal = marked?.has(pk);
        let cellClass = '';
        let content = '';
        if (isMarkedNow) {
          cellClass = 'td-mark';
          content = '✗';
        } else if (j >= i) {
          cellClass = 'td-merge';
          content = '✓';
        }
        // Show all final marks in last step
        if (currentStep === steps.length - 1 && isMarkedFinal) {
          cellClass = 'td-mark';
          content = '✗';
        }
        if (currentStep === steps.length - 1 && !isMarkedFinal) {
          cellClass = 'td-merge';
          content = '≡';
        }
        html += `<td class="${cellClass}" style="text-align:center">${content}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody></table>';
    html += '<div style="padding:10px 16px;font-size:0.75rem;color:var(--text-muted)">✗ = distinguishable &nbsp;|&nbsp; ≡ = equivalent</div>';
    container.innerHTML = html;
  }

  function _updateEquivClasses(stepIdx) {
    const container = getEl('equiv-classes-container');
    if (stepIdx < steps.length - 1) {
      // Show in-progress info
      container.innerHTML = `<div class="empty-table-hint">Equivalence classes will appear after marking is complete...</div>`;
      return;
    }

    if (!equivClasses || equivClasses.length === 0) return;

    let html = '';
    equivClasses.forEach((cls, i) => {
      const isMerged = cls.length > 1;
      html += `
        <div class="equiv-class ${isMerged ? 'merged' : 'single'}">
          <span class="equiv-class-label">Class ${i + 1}</span>
          <div class="equiv-states">
            ${cls.map(s => `<span class="equiv-state-chip">${escHtml(s)}</span>`).join('')}
          </div>
          ${isMerged ? '<span style="font-size:0.72rem;color:var(--green);margin-left:auto">merged</span>' : ''}
        </div>
      `;
    });
    container.innerHTML = html;
  }

  function _refreshMinDFACanvas(stepIdx) {
    if (stepIdx < steps.length - 1) return;
    if (!minDfa || minDfa.states.size === 0) return;

    const hint = getEl('min-dfa-canvas-hint');
    if (hint) hint.classList.add('hidden');
    minDfaRenderer.setAutomaton(minDfa);
  }

  function updateButtons() {
    getEl('min-step-back-btn').disabled = currentStep <= 0;
    getEl('min-step-next-btn').disabled = currentStep >= steps.length - 1;
  }

  function getMinDFA() { return minDfa; }

  return { init, prepare, getMinDFA };
})();

window.MinimizePanel = MinimizePanel;
