/* ══════════════════════════════════════════════════════════
   pda-ui.js — PDA Simulator Panel Controller
   ══════════════════════════════════════════════════════════ */
'use strict';

const PDAPanel = (() => {
  const getEl = id => document.getElementById(id);

  let pda       = null;
  let simResult = null;   // { steps, accepted }
  let stepIdx   = -1;

  // ── Init ────────────────────────────────────────────────
  function init() {
    getEl('pda-example-anbn').addEventListener('click', () => loadExample('anbn'));
    getEl('pda-example-parens').addEventListener('click', () => loadExample('parens'));
    getEl('pda-example-wwrev').addEventListener('click', () => loadExample('wwrev'));

    getEl('pda-run-btn').addEventListener('click', runSimulation);
    getEl('pda-step-btn').addEventListener('click', stepForward);
    getEl('pda-reset-btn').addEventListener('click', resetSim);

    getEl('pda-def-add-trans').addEventListener('click', addTransitionFromForm);
    getEl('pda-def-add-state').addEventListener('click', addStateFromForm);
    getEl('pda-def-set-alpha').addEventListener('click', updateAlphabets);

    // Load default
    loadExample('anbn');
  }

  // ── Load Example ─────────────────────────────────────────
  function loadExample(type) {
    if (type === 'anbn')  pda = makeAnBnPDA();
    if (type === 'parens') pda = makeBalancedParensPDA();
    if (type === 'wwrev') pda = makeWwRevPDA();

    resetSim();
    renderPDADefinition();
    UI.toast(`Loaded example: ${exampleLabel(type)}`, 'success');
  }

  function exampleLabel(t) {
    return t === 'anbn' ? 'aⁿbⁿ recognizer' :
           t === 'parens' ? 'Balanced Parentheses' : 'ww^R mirror language';
  }

  // ── Render PDA definition in the info panel ───────────────
  function renderPDADefinition() {
    if (!pda) return;

    // States
    const statesList = getEl('pda-states-display');
    statesList.innerHTML = [...pda.states].map(s => {
      const tags = [];
      if (s === pda.startState)      tags.push('<span class="state-badge badge-start">Start</span>');
      if (pda.acceptStates.has(s))   tags.push('<span class="state-badge badge-accept">Accept</span>');
      return `<div class="pda-state-chip">${s} ${tags.join('')}</div>`;
    }).join('');

    // Alphabets
    getEl('pda-input-alpha-display').textContent  = [...pda.inputAlpha].join(', ') || '—';
    getEl('pda-stack-alpha-display').textContent  = [...pda.stackAlpha].join(', ') || '—';
    getEl('pda-start-state-display').textContent  = pda.startState || '—';
    getEl('pda-start-stack-display').textContent  = pda.startStack || '—';
    getEl('pda-accept-display').textContent       = [...pda.acceptStates].join(', ') || '—';

    // Transitions table
    const tbody = getEl('pda-trans-tbody');
    tbody.innerHTML = pda.transitions.map((t, i) =>
      `<tr>
        <td class="td-state">${t.from}</td>
        <td><span class="trans-sym">${t.input}</span></td>
        <td><span class="trans-sym">${t.stackTop}</span></td>
        <td class="td-state">${t.to}</td>
        <td><span class="trans-sym">${t.push === 'ε' || t.push === '' ? 'ε' : t.push}</span></td>
        <td><button class="icon-btn danger" onclick="PDAPanel._delTrans(${i})" title="Delete">✕</button></td>
      </tr>`
    ).join('');

    // Repopulate form selects
    const states = [...pda.states];
    const syms   = [...pda.inputAlpha, 'ε'];
    const stackS = [...pda.stackAlpha, 'ε'];

    _populateSelect('pda-form-from',  states);
    _populateSelect('pda-form-to',    states);
    _populateSelect('pda-form-input', syms);
    _populateSelect('pda-form-stack-top', stackS);
    _populateSelect('pda-form-push',  [...pda.stackAlpha, 'ε']);
  }

  function _populateSelect(id, options) {
    const sel = getEl(id);
    if (!sel) return;
    sel.innerHTML = options.map(o => `<option value="${o}">${o}</option>`).join('');
  }

  function _delTrans(i) {
    pda.transitions.splice(i, 1);
    resetSim();
    renderPDADefinition();
  }

  // ── Manual PDA building ───────────────────────────────────
  function addStateFromForm() {
    const name    = getEl('pda-new-state-name').value.trim();
    const isStart = getEl('pda-new-state-start').checked;
    const isAccept= getEl('pda-new-state-accept').checked;
    if (!name) { UI.toast('Enter a state name', 'error'); return; }
    if (!pda) pda = new PDA();
    pda.addState(name, isStart, isAccept);
    getEl('pda-new-state-name').value = '';
    renderPDADefinition();
    UI.toast(`State ${name} added`, 'success');
  }

  function addTransitionFromForm() {
    const from     = getEl('pda-form-from').value;
    const input    = getEl('pda-form-input').value;
    const stackTop = getEl('pda-form-stack-top').value;
    const to       = getEl('pda-form-to').value;
    const push     = getEl('pda-form-push-text').value.trim() || 'ε';
    if (!from || !to) { UI.toast('Select from/to states', 'error'); return; }
    pda.addTransition(from, input, stackTop, to, push);
    resetSim();
    renderPDADefinition();
    UI.toast('Transition added', 'success');
  }

  function updateAlphabets() {
    const inputA = getEl('pda-input-alpha-input').value.split(',').map(s => s.trim()).filter(Boolean);
    const stackA = getEl('pda-stack-alpha-input').value.split(',').map(s => s.trim()).filter(Boolean);
    if (!pda) pda = new PDA();
    pda.inputAlpha = new Set(inputA);
    pda.stackAlpha = new Set(stackA);
    renderPDADefinition();
    UI.toast('Alphabets updated', 'success');
  }

  // ── Simulation ────────────────────────────────────────────
  function runSimulation() {
    if (!pda) { UI.toast('Load or define a PDA first', 'error'); return; }
    const str = getEl('pda-input-string').value.trim();
    simResult = pda.simulate(str);
    stepIdx   = simResult.steps.length - 1; // show final state
    renderAllSteps();
    showVerdict(simResult.accepted);
  }

  function stepForward() {
    if (!pda) { UI.toast('Load or define a PDA first', 'error'); return; }
    if (!simResult) {
      const str = getEl('pda-input-string').value.trim();
      simResult = pda.simulate(str);
      stepIdx   = -1;
    }
    if (stepIdx < simResult.steps.length - 1) {
      stepIdx++;
      renderStepAt(stepIdx);
      if (stepIdx === simResult.steps.length - 1) showVerdict(simResult.accepted);
    }
  }

  function resetSim() {
    simResult = null;
    stepIdx   = -1;
    getEl('pda-trace-body').innerHTML = '<tr><td colspan="4" class="empty-table-hint">Run a string to see the trace</td></tr>';
    getEl('pda-stack-visual').innerHTML = '<div class="stack-empty">Stack empty</div>';
    getEl('pda-verdict-box').className  = 'pda-verdict-box';
    getEl('pda-verdict-text').textContent = '';
    getEl('pda-current-state-pill').textContent  = pda?.startState || '—';
    getEl('pda-current-input-pill').textContent  = '—';
  }

  function renderAllSteps() {
    const tbody = getEl('pda-trace-body');
    tbody.innerHTML = '';
    if (!simResult || !simResult.steps.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="empty-table-hint">No steps recorded</td></tr>';
      return;
    }
    simResult.steps.forEach((s, i) => {
      const cls = s.accepted ? 'trace-step done' : s.rejected ? 'trace-step dead' : 'trace-step';
      tbody.innerHTML += `
        <tr class="${cls}" id="pda-trace-row-${i}">
          <td class="trace-idx">${i}</td>
          <td class="td-state">${s.state}</td>
          <td><code>${s.inputRemaining}</code></td>
          <td><code>${s.stack.join('')}</code></td>
        </tr>`;
    });
    // Show last step stack
    const last = simResult.steps[simResult.steps.length - 1];
    renderStack(last.stack);
    getEl('pda-current-state-pill').textContent = last.state;
    getEl('pda-current-input-pill').textContent = last.inputRemaining;
  }

  function renderStepAt(i) {
    const s = simResult.steps[i];
    if (!s) return;

    // Highlight row
    document.querySelectorAll('[id^="pda-trace-row-"]').forEach(r => r.classList.remove('active'));
    const row = getEl(`pda-trace-row-${i}`);
    if (!row) {
      // build incrementally if not built yet
      renderAllSteps();
      return;
    }
    row.classList.add('active');
    row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    renderStack(s.stack);
    getEl('pda-current-state-pill').textContent = s.state;
    getEl('pda-current-input-pill').textContent = s.inputRemaining;
  }

  function renderStack(stack) {
    const el = getEl('pda-stack-visual');
    if (!stack || stack.length === 0) {
      el.innerHTML = '<div class="stack-empty">Empty</div>';
      return;
    }
    // Top of stack = last element → rendered at top
    el.innerHTML = [...stack].reverse().map((sym, i) => {
      const isTop = i === 0;
      return `<div class="stack-cell${isTop ? ' stack-top' : ''}">
        <span class="stack-sym">${sym}</span>
        ${isTop ? '<span class="stack-label">top</span>' : ''}
      </div>`;
    }).join('');
  }

  function showVerdict(accepted) {
    const box  = getEl('pda-verdict-box');
    const text = getEl('pda-verdict-text');
    box.className  = `pda-verdict-box ${accepted ? 'verdict-accept' : 'verdict-reject'}`;
    text.textContent = accepted ? '✓ ACCEPTED' : '✗ REJECTED';
  }

  // expose _delTrans globally so onclick works
  return { init, _delTrans };
})();

window.PDAPanel = PDAPanel;
