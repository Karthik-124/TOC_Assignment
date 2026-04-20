/* ══════════════════════════════════════════════════════════
   pda.js — Pushdown Automaton logic + step-by-step simulator
   ══════════════════════════════════════════════════════════ */
'use strict';

class PDA {
  constructor() {
    this.states      = new Set();   // state names
    this.inputAlpha  = new Set();   // Σ
    this.stackAlpha  = new Set();   // Γ
    this.transitions = [];          // [{from, input, stackTop, to, push}]
    this.startState  = null;
    this.startStack  = 'Z';        // bottom-of-stack marker
    this.acceptStates = new Set();
  }

  addState(name, isStart = false, isAccept = false) {
    this.states.add(name);
    if (isStart) this.startState = name;
    if (isAccept) this.acceptStates.add(name);
  }

  addTransition(from, input, stackTop, to, push) {
    // input: symbol or 'ε'
    // stackTop: symbol or 'ε' (don't pop)
    // push: string to push (ε = push nothing, 'AB' = push A on top of B, etc.)
    this.transitions.push({ from, input, stackTop, to, push });
  }

  // Returns applicable transitions for a given config
  _getTransitions(state, inputSym, stackTop) {
    return this.transitions.filter(t => {
      const matchState = t.from === state;
      const matchInput = t.input === inputSym || t.input === 'ε';
      const matchStack = t.stackTop === stackTop || t.stackTop === 'ε';
      return matchState && matchInput && matchStack;
    });
  }

  // Simulate one input string (deterministic-first path, BFS fallback)
  // Returns array of step objects for visualization
  simulate(inputStr) {
    const steps = [];
    const chars = inputStr === '' ? [] : inputStr.split('');

    // BFS / DFS over configurations: {state, inputPos, stack, history}
    // We take the first accepting path or exhaustive rejection
    const initial = {
      state: this.startState,
      pos: 0,
      stack: [this.startStack],
      history: []
    };

    // DFS stack (we want step-by-step so we simulate deterministically)
    const queue = [initial];
    const visited = new Set();
    let accepted = false;
    let finalHistory = null;

    while (queue.length > 0) {
      const cfg = queue.pop();
      const { state, pos, stack, history } = cfg;
      const stackTop = stack.length > 0 ? stack[stack.length - 1] : 'ε';
      const inputSym = pos < chars.length ? chars[pos] : 'ε';

      const key = `${state}|${pos}|${stack.join(',')}`;
      if (visited.has(key)) continue;
      visited.add(key);

      // Record this config as a step
      const step = {
        state,
        inputPos: pos,
        inputRemaining: chars.slice(pos).join('') || 'ε',
        stack: [...stack],
        stackTop,
        inputSym,
        transitions: [],
        accepted: false,
        rejected: false
      };

      // Check accept: in accept state AND all input consumed
      if (this.acceptStates.has(state) && pos >= chars.length) {
        step.accepted = true;
        step.transitions = [];
        history.push(step);
        accepted = true;
        finalHistory = history;
        break;
      }

      // Get applicable transitions
      // Try consuming input first, then ε-transitions
      const consuming = this._getTransitions(state, inputSym, stackTop);
      const epsilon   = this._getTransitions(state, 'ε', stackTop);
      const applicable = [...consuming, ...epsilon];

      if (applicable.length === 0 && pos >= chars.length) {
        // Out of input, no transitions — reject
        step.rejected = true;
        history.push(step);
        finalHistory = history;
        break;
      }

      if (applicable.length === 0) {
        step.rejected = true;
        history.push(step);
        // Continue BFS — maybe another branch accepts
        continue;
      }

      step.transitions = applicable.map(t => `δ(${t.from}, ${t.input}, ${t.stackTop}) → (${t.to}, ${t.push})`);
      history.push(step);

      // Push children (reverse so first trans explored first)
      for (let i = applicable.length - 1; i >= 0; i--) {
        const t = applicable[i];
        const newPos   = t.input !== 'ε' ? pos + 1 : pos;
        const newStack = [...stack];
        // Pop stack top if transition requires it
        if (t.stackTop !== 'ε') newStack.pop();
        // Push new symbols (push string reversed, leftmost = top)
        if (t.push !== 'ε' && t.push !== '') {
          for (let j = t.push.length - 1; j >= 0; j--) {
            newStack.push(t.push[j]);
          }
        }
        queue.push({ state: t.to, pos: newPos, stack: newStack, history: [...history] });
      }
    }

    return { steps: finalHistory || [], accepted };
  }
}

// ── Built-in Example PDAs ────────────────────────────────

function makeAnBnPDA() {
  const pda = new PDA();
  pda.startStack = 'Z';

  // States: q0 (start), q1 (popping), q2 (accept)
  pda.addState('q0', true, false);
  pda.addState('q1', false, false);
  pda.addState('q2', false, true);

  pda.inputAlpha  = new Set(['a', 'b']);
  pda.stackAlpha  = new Set(['A', 'Z']);

  // On 'a': stay in q0, push A on top of stack (any stack top)
  pda.addTransition('q0', 'a', 'Z', 'q0', 'AZ');
  pda.addTransition('q0', 'a', 'A', 'q0', 'AA');
  // On 'b': switch to q1, pop one A
  pda.addTransition('q0', 'b', 'A', 'q1', 'ε');
  // Continue popping
  pda.addTransition('q1', 'b', 'A', 'q1', 'ε');
  // Accept when stack bottom (Z) reached and input exhausted
  pda.addTransition('q1', 'ε', 'Z', 'q2', 'Z');

  return pda;
}

function makeBalancedParensPDA() {
  const pda = new PDA();
  pda.startStack = 'Z';

  pda.addState('q0', true, false);
  pda.addState('q1', false, true);

  pda.inputAlpha = new Set(['(', ')']);
  pda.stackAlpha = new Set(['P', 'Z']);

  pda.addTransition('q0', '(', 'Z', 'q0', 'PZ');
  pda.addTransition('q0', '(', 'P', 'q0', 'PP');
  pda.addTransition('q0', ')', 'P', 'q0', 'ε');
  pda.addTransition('q0', 'ε', 'Z', 'q1', 'Z');

  return pda;
}

function makeWwRevPDA() {
  // Accepts ww^R over {a,b}
  const pda = new PDA();
  pda.startStack = 'Z';

  pda.addState('q0', true, false);
  pda.addState('q1', false, false);
  pda.addState('q2', false, true);

  pda.inputAlpha = new Set(['a', 'b']);
  pda.stackAlpha = new Set(['A', 'B', 'Z']);

  // Push phase
  pda.addTransition('q0', 'a', 'Z', 'q0', 'AZ');
  pda.addTransition('q0', 'a', 'A', 'q0', 'AA');
  pda.addTransition('q0', 'a', 'B', 'q0', 'AB');
  pda.addTransition('q0', 'b', 'Z', 'q0', 'BZ');
  pda.addTransition('q0', 'b', 'A', 'q0', 'BA');
  pda.addTransition('q0', 'b', 'B', 'q0', 'BB');
  // Nondeterministic switch to pop phase (ε)
  pda.addTransition('q0', 'ε', 'A', 'q1', 'A');
  pda.addTransition('q0', 'ε', 'B', 'q1', 'B');
  // Pop phase
  pda.addTransition('q1', 'a', 'A', 'q1', 'ε');
  pda.addTransition('q1', 'b', 'B', 'q1', 'ε');
  // Accept
  pda.addTransition('q1', 'ε', 'Z', 'q2', 'Z');

  return pda;
}

window.PDA             = PDA;
window.makeAnBnPDA     = makeAnBnPDA;
window.makeBalancedParensPDA = makeBalancedParensPDA;
window.makeWwRevPDA    = makeWwRevPDA;
