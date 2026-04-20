# AutomataViz — NFA/DFA · PDA Simulator

> **Theory of Computation | Unit 1 & 2 Assignment**
> Interactive simulation of NFA → DFA conversion, DFA Minimization, and Pushdown Automaton simulation

## Live Demo
[**tocunit1.vercel.app**](https://tocunit1.vercel.app/)

## How to Use

1. **Build your NFA** — Go to the *NFA Builder* tab. Click "Load Example NFA" to use the pre-loaded example, or add your own states, alphabet symbols, and transitions manually.
2. **Convert to DFA** — Click "Convert NFA → DFA". Use "Next Step" to walk through the Subset Construction algorithm step by step, or click "Run All" to see the complete result at once.
3. **Minimize the DFA** — Click "Minimize DFA →". Step through or run the Table-Filling (Myhill-Nerode) algorithm to see equivalent states merged.
4. **Test Strings** — Click "Test Strings →". Enter any input string and click "Run" to see if it's accepted or rejected, with a full execution trace. Use "Step" to advance one symbol at a time.
5. **PDA Simulator** — Click the "PDA Simulator" tab. Choose a built-in example (aⁿbⁿ, Balanced Parentheses, or ww^R), enter an input string, and click "Run" or "Step" to simulate the pushdown automaton computation with live stack visualization.

## Features

### 🔷 NFA Builder (Tab 1)
- **Interactive canvas** — double-click to add states, drag to move
- **Tool modes** — Select, Add State, Draw Edge
- **Right-click state** — set as start, toggle accept, delete
- Sidebar controls for states, alphabet, transitions
- Epsilon (ε) transitions supported
- Load example NFA instantly

### ⚡ NFA → DFA Conversion (Tab 2)
- **Step-by-step Subset Construction Algorithm**
- Animated step log with highlighted transitions
- Live-updating subset construction table
- Resulting DFA graph rendered in real-time as steps progress
- Scroll to zoom · Drag to pan on the graph canvas

### ✂️ DFA Minimization (Tab 3)
- **Table-Filling (Myhill-Nerode) Algorithm** step by step
- Distinguishability table with ✗/≡ markings
- Equivalence classes shown after convergence
- Minimized DFA graph visualization

### 🧪 String Tester (Tab 4)
- Test strings on DFA or Minimized DFA
- **Step-through mode** — advance one symbol at a time
- Live highlighted state on graph
- Full execution trace with ACCEPT/REJECT verdict
- Quick-test chips, test history

### 🥞 PDA Simulator (Tab 5)
- Simulate **Pushdown Automata** step by step
- **3 built-in examples:**
  - **aⁿbⁿ** — classic context-free language (pushes A for each 'a', pops for each 'b')
  - **Balanced Parentheses** — `(())` accepted, `(()` rejected
  - **ww^R** — mirror/palindrome language
- Live **stack visualization** showing current contents (top → bottom)
- Computation trace table: state, remaining input, stack at each step
- ACCEPTED / REJECTED verdict with glow effect
- Manual PDA builder — add states, set Σ and Γ, define transitions

## Project Structure

```
TOC/
├── index.html        # Main app HTML
├── css/
│   └── style.css     # Dark glassmorphism theme
├── js/
│   ├── nfa.js        # NFA/DFA classes + algorithms
│   ├── graph.js      # Canvas renderer (pan/zoom)
│   ├── convert.js    # Subset construction panel
│   ├── minimize.js   # Minimization panel
│   ├── tester.js     # String testing panel
│   ├── pda.js        # PDA class + simulation logic
│   ├── pda-ui.js     # PDA simulator panel controller
│   └── ui.js         # Main UI controller
├── vercel.json
└── package.json
```

## Algorithms Implemented

| Concept | Algorithm |
|---------|-----------|
| ε-closure | BFS/DFS from each state on ε-transitions |
| NFA → DFA | Subset Construction (Powerset Algorithm) |
| DFA Minimization | Table-Filling (Myhill-Nerode Equivalence) |
| String Acceptance | DFA simulation with transition function |
| PDA Simulation | DFS over configurations (state, input pos, stack) |

## Run Locally

```bash
npx serve . -p 3000
# Open http://localhost:3000
```
