/* ══════════════════════════════════════════════════════════
   nfa.js — NFA/DFA Data Structures & Algorithms
   ══════════════════════════════════════════════════════════ */

'use strict';

// ── NFA State Machine ──────────────────────────────────────
class NFA {
  constructor() {
    this.states = new Map();   // name → { name, isStart, isAccept, x, y }
    this.alphabet = new Set(); // symbols (not including epsilon)
    this.transitions = [];     // { from, symbol, to }  (symbol can be 'ε')
  }

  addState(name, options = {}) {
    if (!this.states.has(name)) {
      const { isStart = false, isAccept = false, x = 200, y = 200 } = options;
      this.states.set(name, { name, isStart, isAccept, x, y, id: name });
      return true;
    }
    return false;
  }

  removeState(name) {
    this.states.delete(name);
    this.transitions = this.transitions.filter(t => t.from !== name && t.to !== name);
  }

  setStart(name) {
    this.states.forEach(s => s.isStart = false);
    if (this.states.has(name)) this.states.get(name).isStart = true;
  }

  toggleAccept(name) {
    if (this.states.has(name)) {
      const s = this.states.get(name);
      s.isAccept = !s.isAccept;
    }
  }

  addTransition(from, symbol, to) {
    // Allow multiple targets from one (from, symbol) pair
    const existing = this.transitions.find(t => t.from === from && t.symbol === symbol && t.to === to);
    if (!existing) {
      this.transitions.push({ from, symbol, to });
    }
  }

  removeTransition(from, symbol, to) {
    this.transitions = this.transitions.filter(
      t => !(t.from === from && t.symbol === symbol && t.to === to)
    );
  }

  // Epsilon closure of a set of states
  epsilonClosure(stateSet) {
    const closure = new Set(stateSet);
    const stack = [...stateSet];
    while (stack.length > 0) {
      const s = stack.pop();
      for (const t of this.transitions) {
        if (t.from === s && t.symbol === 'ε' && !closure.has(t.to)) {
          closure.add(t.to);
          stack.push(t.to);
        }
      }
    }
    return closure;
  }

  // Move: from a set of states, read symbol, return set of reachable states
  move(stateSet, symbol) {
    const result = new Set();
    for (const s of stateSet) {
      for (const t of this.transitions) {
        if (t.from === s && t.symbol === symbol) {
          result.add(t.to);
        }
      }
    }
    return result;
  }

  getStart() {
    for (const [, s] of this.states) if (s.isStart) return s.name;
    return null;
  }

  validate() {
    const errors = [];
    if (this.states.size === 0) errors.push('No states defined.');
    if (!this.getStart()) errors.push('No start state designated.');
    const hasAccept = [...this.states.values()].some(s => s.isAccept);
    if (!hasAccept) errors.push('No accept states designated.');
    if (this.alphabet.size === 0) errors.push('Alphabet is empty.');
    return errors;
  }
}

// ── DFA State Machine ──────────────────────────────────────
class DFA {
  constructor() {
    this.states = new Map();      // name → { name, isStart, isAccept, x, y, nfaStates: Set }
    this.alphabet = new Set();
    this.transitions = new Map(); // "from\x00symbol" → toName  (null-byte separator avoids comma collisions)
    this.transitionList = [];     // [{from, symbol, to}] — used by the graph renderer
    this.startState = null;
  }

  addState(name, options = {}) {
    const { isStart = false, isAccept = false, x = 0, y = 0, nfaStates = new Set() } = options;
    this.states.set(name, { name, isStart, isAccept, x, y, nfaStates });
    if (isStart) this.startState = name;
  }

  addTransition(from, symbol, to) {
    const key = `${from}\x00${symbol}`;
    if (!this.transitions.has(key)) {
      this.transitionList.push({ from, symbol, to });
    }
    this.transitions.set(key, to);
  }

  getTransition(from, symbol) {
    return this.transitions.get(`${from}\x00${symbol}`) ?? null;
  }

  // Run a string on the DFA, return steps array
  runString(input) {
    const steps = [];
    let current = this.startState;

    if (!current) return { accepted: false, steps: [], error: 'No start state.' };

    steps.push({ state: current, symbol: null, index: -1, type: 'start' });

    for (let i = 0; i < input.length; i++) {
      const sym = input[i];
      const next = this.getTransition(current, sym);
      steps.push({ state: current, symbol: sym, index: i, next: next ?? 'DEAD', type: next ? 'step' : 'dead' });
      if (!next) {
        return { accepted: false, steps, deadAt: i };
      }
      current = next;
    }

    const finalState = this.states.get(current);
    const accepted = finalState ? finalState.isAccept : false;
    steps.push({ state: current, symbol: null, index: input.length, type: accepted ? 'accept' : 'reject' });
    return { accepted, steps };
  }
}

// ── Subset Construction ────────────────────────────────────
function subsetConstruction(nfa) {
  const steps = [];
  const dfa = new DFA();
  dfa.alphabet = new Set(nfa.alphabet);

  const startName = nfa.getStart();
  if (!startName) return { dfa, steps, error: 'No start state.' };

  const startClosure = nfa.epsilonClosure(new Set([startName]));
  const startLabel = setToLabel(startClosure);

  // Map from DFA state label → Set of NFA states
  const labelToSet = new Map();
  labelToSet.set(startLabel, startClosure);

  const queue = [startLabel];
  const processed = new Set();

  const isAcceptSet = (s) => [...s].some(name => nfa.states.get(name)?.isAccept);

  steps.push({
    type: 'init',
    label: 'Initialization',
    msg: `Start state of DFA = ε-closure({${startName}}) = {${[...startClosure].join(', ')}} → labeled <code>${startLabel}</code>`,
    highlight: startLabel
  });

  let dfaStateCount = 0;
  while (queue.length > 0) {
    const current = queue.shift();
    if (processed.has(current)) continue;
    processed.add(current);

    const currentSet = labelToSet.get(current);
    const isAccept = isAcceptSet(currentSet);

    // Layout position
    const angle = (dfaStateCount / Math.max(1, queue.length + dfaStateCount)) * 2 * Math.PI;
    const cx = 420, cy = 180, r = 130;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);

    dfa.addState(current, {
      isStart: current === startLabel,
      isAccept,
      x, y,
      nfaStates: currentSet
    });
    dfaStateCount++;

    steps.push({
      type: 'process',
      label: `Processing ${current}`,
      msg: `Processing DFA state <code>${current}</code> = {${[...currentSet].join(', ')}}${isAccept ? ' <b style="color:var(--green)">[ACCEPT]</b>' : ''}`,
      highlight: current
    });

    for (const sym of nfa.alphabet) {
      const moved = nfa.move(currentSet, sym);
      const closure = nfa.epsilonClosure(moved);
      const newLabel = setToLabel(closure);

      if (closure.size === 0) {
        steps.push({
          type: 'transition',
          label: `δ(${current}, ${sym}) = ∅`,
          msg: `<code>δ(${current}, ${sym})</code> = ε-closure(move({${[...currentSet].join(',')}}, ${sym})) = <code>∅</code> → dead state`,
          highlight: null
        });
        continue;
      }

      steps.push({
        type: 'transition',
        label: `δ(${current}, ${sym}) = ${newLabel}`,
        msg: `<code>δ(${current}, ${sym})</code> = ε-closure({${[...moved].join(',')}}) = <code>${newLabel}</code>${!labelToSet.has(newLabel) ? ' ← <b style="color:var(--yellow)">new state!</b>' : ''}`,
        highlight: newLabel
      });

      if (!labelToSet.has(newLabel)) {
        labelToSet.set(newLabel, closure);
        queue.push(newLabel);
      }
      dfa.addTransition(current, sym, newLabel);
    }
  }

  steps.push({
    type: 'done',
    label: 'Conversion Complete!',
    msg: `DFA constructed with <b>${dfa.states.size}</b> states and <b>${dfa.transitions.size}</b> transitions.`,
    highlight: null
  });

  // Layout the DFA states nicely
  layoutDFA(dfa);

  return { dfa, steps };
}

function layoutDFA(dfa) {
  const states = [...dfa.states.values()];
  const n = states.length;
  if (n === 0) return;

  // Find start state and place it on the left
  const startIdx = states.findIndex(s => s.isStart);
  if (startIdx > 0) {
    [states[0], states[startIdx]] = [states[startIdx], states[0]];
  }

  const cx = 400, cy = 200;
  const radii = [0, 130, 220, 290];

  if (n === 1) {
    states[0].x = cx;
    states[0].y = cy;
    return;
  }

  // Circular layout with start on left
  for (let i = 0; i < n; i++) {
    const angle = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    const r = n <= 4 ? 150 : n <= 8 ? 190 : 230;
    states[i].x = cx + r * Math.cos(angle);
    states[i].y = cy + r * Math.sin(angle);
  }
}

// ── DFA Minimization (Table-Filling) ──────────────────────
function minimizeDFA(dfa) {
  const steps = [];
  const stateNames = [...dfa.states.keys()];
  const n = stateNames.length;

  if (n <= 1) {
    const minDfa = cloneDFA(dfa);
    steps.push({ type: 'done', label: 'Already Minimal', msg: 'DFA has only 1 state — already minimal.', table: null });
    return { minDfa, steps, equivClasses: stateNames.map(s => [s]) };
  }

  // Build pair table: pairs[i][j] = true means (i,j) are distinguishable
  const pairs = {};
  const pairKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const marked = new Set();
  const waitList = new Map(); // pairKey → [dependents that could become marked]

  // Initialize
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      waitList.set(pairKey(stateNames[i], stateNames[j]), []);
    }
  }

  steps.push({
    type: 'init', label: 'Base Case',
    msg: `Mark all pairs <code>(F, non-F)</code> as distinguishable (final vs non-final).`,
    markedPairs: []
  });

  // Base: mark (accept, non-accept) pairs
  const newlyMarked = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const si = dfa.states.get(stateNames[i]);
      const sj = dfa.states.get(stateNames[j]);
      if (si.isAccept !== sj.isAccept) {
        marked.add(pairKey(stateNames[i], stateNames[j]));
        newlyMarked.push([stateNames[i], stateNames[j]]);
      }
    }
  }

  steps.push({
    type: 'base', label: 'Initial Marking',
    msg: `Marked ${newlyMarked.length} pairs: ${newlyMarked.map(([a,b]) => `(${a},${b})`).join(', ') || 'none'}.`,
    markedPairs: [...newlyMarked]
  });

  // Iterate: mark (p,q) if for some symbol, δ(p,a) and δ(q,a) are already marked
  let changed = true;
  let iteration = 0;
  while (changed) {
    changed = false;
    iteration++;
    const iterMarked = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const pk = pairKey(stateNames[i], stateNames[j]);
        if (marked.has(pk)) continue;
        for (const sym of dfa.alphabet) {
          const di = dfa.getTransition(stateNames[i], sym);
          const dj = dfa.getTransition(stateNames[j], sym);
          if (!di || !dj) continue;
          if (di === dj) continue;
          const derivedKey = pairKey(di, dj);
          if (marked.has(derivedKey)) {
            marked.add(pk);
            iterMarked.push([stateNames[i], stateNames[j], sym, di, dj]);
            changed = true;
            break;
          }
        }
      }
    }
    if (iterMarked.length > 0 || iteration <= 3) {
      steps.push({
        type: 'iterate', label: `Iteration ${iteration}`,
        msg: iterMarked.length > 0
          ? `Marked ${iterMarked.length} new pair(s): ${iterMarked.map(([a,b,s,d,e]) => `(${a},${b}) via '${s}'`).join(', ')}.`
          : `No new pairs marked — algorithm converged.`,
        markedPairs: iterMarked.map(x => [x[0], x[1]])
      });
    }
    if (!changed) break;
  }

  // Find equivalence classes (unmarked pairs = equivalent states)
  const parent = {};
  stateNames.forEach(s => parent[s] = s);
  const find = (s) => { while (parent[s] !== s) { parent[s] = parent[parent[s]]; s = parent[s]; } return s; };
  const union = (a, b) => { parent[find(a)] = find(b); };

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (!marked.has(pairKey(stateNames[i], stateNames[j]))) {
        union(stateNames[i], stateNames[j]);
      }
    }
  }

  // Group by representative
  const classMap = new Map();
  stateNames.forEach(s => {
    const rep = find(s);
    if (!classMap.has(rep)) classMap.set(rep, []);
    classMap.get(rep).push(s);
  });

  const equivClasses = [...classMap.values()];

  steps.push({
    type: 'equiv', label: 'Equivalence Classes',
    msg: `Found <b>${equivClasses.length}</b> equivalence class(es): ${equivClasses.map(c => `{${c.join(',')}}`).join(', ')}.`,
    markedPairs: []
  });

  // Build minimized DFA
  const minDfa = new DFA();
  minDfa.alphabet = new Set(dfa.alphabet);

  const getRepState = (s) => {
    const rep = find(s);
    return equivClasses.find(cls => cls.includes(rep))?.[0] ?? rep;
  };

  const repName = (cls) => cls.length === 1 ? cls[0] : cls.join('|');

  equivClasses.forEach((cls, idx) => {
    const rep = cls[0];
    const originalState = dfa.states.get(rep);
    const angle = (idx / equivClasses.length) * 2 * Math.PI - Math.PI / 2;
    const r = equivClasses.length <= 3 ? 130 : 170;
    const cx = 350, cy = 180;
    minDfa.addState(repName(cls), {
      isStart: cls.some(s => dfa.states.get(s)?.isStart),
      isAccept: cls.some(s => dfa.states.get(s)?.isAccept),
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      nfaStates: new Set(cls)
    });
  });

  // Add transitions
  equivClasses.forEach(cls => {
    const rep = cls[0];
    const fromName = repName(cls);
    for (const sym of dfa.alphabet) {
      const target = dfa.getTransition(rep, sym);
      if (target) {
        const targetCls = equivClasses.find(c => c.includes(find(target)));
        if (targetCls) {
          minDfa.addTransition(fromName, sym, repName(targetCls));
        }
      }
    }
  });

  steps.push({
    type: 'done', label: 'Minimization Complete!',
    msg: `Minimized DFA has <b>${minDfa.states.size}</b> state(s) (reduced from ${n}).`,
    markedPairs: []
  });

  return { minDfa, steps, equivClasses, marked, stateNames };
}

// ── Helpers ────────────────────────────────────────────────
function setToLabel(stateSet) {
  if (stateSet.size === 0) return '∅';
  return '{' + [...stateSet].sort().join(',') + '}';
}

function cloneDFA(dfa) {
  const clone = new DFA();
  clone.alphabet = new Set(dfa.alphabet);
  dfa.states.forEach((s, k) => clone.addState(k, { ...s }));
  // Use transitionList so comma-containing state names (e.g. {q0,q1}) are preserved
  dfa.transitionList.forEach(({ from, symbol, to }) => {
    clone.addTransition(from, symbol, to);
  });
  return clone;
}

// ── Example NFA ────────────────────────────────────────────
function loadExampleNFA(nfa) {
  nfa.states.clear();
  nfa.transitions = [];
  nfa.alphabet = new Set(['a', 'b']);

  // Classic example: NFA that accepts strings ending in 'ab'
  const W = 680, H = 360;
  nfa.addState('q0', { isStart: true, isAccept: false, x: W*0.15, y: H*0.5 });
  nfa.addState('q1', { isStart: false, isAccept: false, x: W*0.45, y: H*0.5 });
  nfa.addState('q2', { isStart: false, isAccept: true, x: W*0.75, y: H*0.5 });

  nfa.addTransition('q0', 'a', 'q0');
  nfa.addTransition('q0', 'b', 'q0');
  nfa.addTransition('q0', 'a', 'q1');
  nfa.addTransition('q1', 'b', 'q2');

  return 'Loaded example NFA: accepts strings ending in "ab" over {a, b}';
}

function loadEpsilonExampleNFA(nfa) {
  nfa.states.clear();
  nfa.transitions = [];
  nfa.alphabet = new Set(['a', 'b', 'c']);

  // NFA with epsilon transitions: accepts strings of form a*b*c*
  const W = 680, H = 360;
  nfa.addState('q0', { isStart: true, isAccept: false, x: W*0.15, y: H*0.5 });
  nfa.addState('q1', { isStart: false, isAccept: false, x: W*0.42, y: H*0.5 });
  nfa.addState('q2', { isStart: false, isAccept: false, x: W*0.68, y: H*0.5 });
  nfa.addState('q3', { isStart: false, isAccept: true, x: W*0.88, y: H*0.5 });

  nfa.addTransition('q0', 'a', 'q0');
  nfa.addTransition('q0', 'ε', 'q1');
  nfa.addTransition('q1', 'b', 'q1');
  nfa.addTransition('q1', 'ε', 'q2');
  nfa.addTransition('q2', 'c', 'q2');
  nfa.addTransition('q2', 'ε', 'q3');

  return 'Loaded ε-NFA example: accepts a*b*c* over {a, b, c}';
}

// Export to global
window.NFA = NFA;
window.DFA = DFA;
window.subsetConstruction = subsetConstruction;
window.minimizeDFA = minimizeDFA;
window.loadExampleNFA = loadExampleNFA;
window.loadEpsilonExampleNFA = loadEpsilonExampleNFA;
window.setToLabel = setToLabel;
