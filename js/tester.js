/* ══════════════════════════════════════════════════════════
   tester.js — String Testing Panel Logic
   ══════════════════════════════════════════════════════════ */

'use strict';

const TesterPanel = (() => {
  let dfa = null;
  let minDfa = null;
  let testRenderer = null;
  let testHistory = [];
  let traceSteps = [];
  let traceIdx = -1;
  let stepMode = false;

  const getEl = (id) => document.getElementById(id);

  function init() {
    getEl('run-test-btn').addEventListener('click', runTest);
    getEl('step-test-btn').addEventListener('click', startStepMode);
    getEl('test-prev-btn').addEventListener('click', prevTraceStep);
    getEl('test-next-btn').addEventListener('click', nextTraceStep);

    getEl('test-string-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') runTest();
    });

    const canvas = getEl('test-canvas');
    testRenderer = new GraphRenderer(canvas);
  }

  function prepare(newDfa, newMinDfa) {
    dfa = newDfa;
    minDfa = newMinDfa;
    testHistory = [];
    traceSteps = [];
    traceIdx = -1;
    stepMode = false;

    getEl('trace-container').innerHTML = '<div class="empty-table-hint">Run a string to see the trace</div>';
    getEl('test-history-container').innerHTML = '<div class="empty-table-hint">Test results will appear here</div>';
    _resetResult();

    const hint = getEl('test-canvas-hint');
    if (hint) hint.classList.remove('hidden');
    testRenderer.setAutomaton(null);
    testRenderer.setCurrentState(null);

    _buildQuickTests();
    UI.toast('Ready to test strings! Enter a string and click Run.', 'info');
  }

  function _getActiveDFA() {
    const radio = document.querySelector('input[name="test-automaton"]:checked');
    const useMin = radio?.value === 'min-dfa';
    if (useMin && minDfa && minDfa.states.size > 0) return minDfa;
    if (dfa && dfa.states.size > 0) return dfa;
    return null;
  }

  function runTest() {
    const input = getEl('test-string-input').value.trim();
    const activeDfa = _getActiveDFA();

    if (!activeDfa) {
      UI.toast('No DFA available. Complete the conversion first.', 'error');
      return;
    }

    stepMode = false;
    _runOnDfa(activeDfa, input);
  }

  function startStepMode() {
    const input = getEl('test-string-input').value.trim();
    const activeDfa = _getActiveDFA();

    if (!activeDfa) {
      UI.toast('No DFA available. Complete the conversion first.', 'error');
      return;
    }

    const result = activeDfa.runString(input);
    traceSteps = result.steps;
    traceIdx = 0;
    stepMode = true;

    // Setup rendering
    const hint = getEl('test-canvas-hint');
    if (hint) hint.classList.add('hidden');
    testRenderer.setAutomaton(activeDfa);

    _renderTraceStep(0);
    _updateTraceUI();
    _updateStepButtons();
  }

  function prevTraceStep() {
    if (traceIdx <= 0) return;
    traceIdx--;
    _renderTraceStep(traceIdx);
    _updateTraceUI();
    _updateStepButtons();
  }

  function nextTraceStep() {
    if (traceIdx >= traceSteps.length - 1) return;
    traceIdx++;
    _renderTraceStep(traceIdx);
    _updateTraceUI();
    _updateStepButtons();
  }

  function _runOnDfa(activeDfa, input) {
    const result = activeDfa.runString(input);
    traceSteps = result.steps;
    traceIdx = result.steps.length - 1;

    // Show full trace
    _renderFullTrace();

    // Final state
    const lastStep = result.steps[result.steps.length - 1];
    testRenderer.setAutomaton(activeDfa);
    if (lastStep.type === 'dead') {
      testRenderer.setCurrentState(lastStep.state, true);
    } else {
      testRenderer.setCurrentState(lastStep.state, false);
    }

    const hint = getEl('test-canvas-hint');
    if (hint) hint.classList.add('hidden');

    _showResult(result.accepted, input, result.steps);
    _addHistory(input, result.accepted);
    _updateStepButtons();
  }

  function _renderTraceStep(idx) {
    if (!traceSteps[idx]) return;
    const step = traceSteps[idx];

    testRenderer.setCurrentState(step.state, step.type === 'dead');
    if (idx > 0 && traceSteps[idx - 1]) {
      const prevStep = traceSteps[idx - 1];
      if (prevStep.symbol) {
        testRenderer.setHighlightedEdge({
          from: prevStep.state,
          symbol: prevStep.symbol,
          to: step.state
        });
      }
    }

    // Trace panel
    _updateTraceUI();
  }

  function _updateTraceUI() {
    const container = getEl('trace-container');
    if (traceSteps.length === 0) return;

    let html = '';
    traceSteps.forEach((step, i) => {
      const isActive = i === traceIdx || (stepMode && i === traceIdx);
      const isCurrent = i === traceIdx;

      let cls = isCurrent ? 'active' : (i < traceIdx ? 'done' : '');
      if (step.type === 'dead') cls = 'dead';

      if (step.type === 'start') {
        html += `<div class="trace-step ${cls}">
          <span class="trace-idx">→</span>
          <span class="trace-state">${escHtml(step.state)}</span>
          <span class="trace-end">(start)</span>
        </div>`;
      } else if (step.type === 'step' || step.type === 'dead') {
        html += `<div class="trace-step ${cls}">
          <span class="trace-idx">${escHtml(String(step.index))}</span>
          <span class="trace-state">${escHtml(step.state)}</span>
          <span class="trace-sym">${escHtml(step.symbol)}</span>
          <span class="trace-arrow">→</span>
          <span class="trace-next">${escHtml(step.next)}</span>
          ${step.type === 'dead' ? '<span class="trace-end">(dead)</span>' : ''}
        </div>`;
      } else if (step.type === 'accept' || step.type === 'reject') {
        html += `<div class="trace-step ${step.type === 'accept' ? 'done' : 'dead'} ${cls}">
          <span class="trace-idx">✓</span>
          <span class="trace-state">${escHtml(step.state)}</span>
          <span class="trace-end">(${step.type})</span>
        </div>`;
      }
    });

    container.innerHTML = html || '<div class="empty-table-hint">No trace steps</div>';

    // Scroll active into view
    const activeEl = container.querySelector('.trace-step.active');
    if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
  }

  function _renderFullTrace() {
    traceIdx = traceSteps.length - 1;
    _updateTraceUI();
  }

  function _showResult(accepted, input, steps) {
    const icon = getEl('result-icon');
    const verdict = getEl('result-verdict');
    const detail = getEl('result-detail');

    if (accepted) {
      icon.textContent = '✓';
      icon.className = 'result-icon accept';
      verdict.textContent = 'ACCEPTED';
      verdict.className = 'result-verdict verdict-accept';
      detail.textContent = `"${input || 'ε'}" → ${steps.length - 1} transition(s)`;
    } else {
      icon.textContent = '✗';
      icon.className = 'result-icon reject';
      verdict.textContent = 'REJECTED';
      verdict.className = 'result-verdict verdict-reject';
      const deadAt = steps.find(s => s.type === 'dead');
      detail.textContent = deadAt
        ? `"${input || 'ε'}" → dead at symbol '${deadAt.symbol}'`
        : `"${input || 'ε'}" → ended in non-accepting state`;
    }
  }

  function _resetResult() {
    const icon = getEl('result-icon');
    const verdict = getEl('result-verdict');
    const detail = getEl('result-detail');
    icon.textContent = '?';
    icon.className = 'result-icon';
    verdict.textContent = 'Awaiting input';
    verdict.className = 'result-verdict';
    detail.textContent = 'Enter a string and click Run';
  }

  function _addHistory(input, accepted) {
    testHistory.unshift({ input, accepted, time: Date.now() });

    const container = getEl('test-history-container');
    const displayStr = input === '' ? 'ε (empty)' : input;
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
      <span class="history-string ${input === '' ? 'empty-str' : ''} mono">"${escHtml(displayStr)}"</span>
      <span class="history-verdict ${accepted ? 'verdict-accept' : 'verdict-reject'}">${accepted ? 'ACCEPT' : 'REJECT'}</span>
    `;

    if (container.querySelector('.empty-table-hint')) container.innerHTML = '';
    container.insertBefore(item, container.firstChild);

    // Keep max 20 items
    while (container.children.length > 20) container.removeChild(container.lastChild);
  }

  function _buildQuickTests() {
    const container = getEl('quick-test-chips');
    container.innerHTML = '';

    // Build some example strings based on the DFA
    const examples = ['', 'a', 'b', 'ab', 'ba', 'aa', 'bb', 'aab', 'aba', 'abab', 'bab'];
    const activeDfa = _getActiveDFA();

    examples.slice(0, 8).forEach(str => {
      let result = null;
      if (activeDfa) {
        const r = activeDfa.runString(str);
        result = r.accepted;
      }
      const chip = document.createElement('button');
      chip.className = `quick-chip${result === true ? ' accept' : result === false ? ' reject' : ''}`;
      chip.textContent = str === '' ? 'ε' : str;
      chip.addEventListener('click', () => {
        getEl('test-string-input').value = str;
        runTest();
      });
      container.appendChild(chip);
    });
  }

  function _updateStepButtons() {
    const hasTrace = traceSteps.length > 0 && stepMode;
    getEl('test-prev-btn').disabled = !hasTrace || traceIdx <= 0;
    getEl('test-next-btn').disabled = !hasTrace || traceIdx >= traceSteps.length - 1;
  }

  return { init, prepare };
})();

window.TesterPanel = TesterPanel;
