# AutomataViz — NFA to DFA Converter & Minimizer

> **Theory of Computation |Assignment**
> Interactive simulation of NFA → DFA conversion via Subset Construction + DFA Minimization via Table-Filling Algorithm

## Live Demo
[*Live Vercel link*](https://tocunit1.vercel.app/)

## Project Structure

```
TOC/
├── index.html        # Main app HTML
├── css/
│   └── style.css     
├── js/
│   ├── nfa.js        # NFA/DFA classes + algorithms
│   ├── graph.js      # Canvas renderer
│   ├── convert.js    # Subset construction panel
│   ├── minimize.js   # Minimization panel
│   ├── tester.js     # String testing panel
│   └── ui.js         # Main UI controller
├── vercel.json       # Vercel deployment config
└── package.json
```



## Features

### 🔷 NFA Builder (Tab 1)
- **Interactive canvas** — double-click to add states, drag to move
- **Tool modes** — Select, Add State, Draw Edge
- **Right-click state** — set as start, toggle accept, delete
- Sidebar controls for states, alphabet, transitions
- Epsilon (ε) transitions supported
- Load example NFAs instantly

### ⚡ NFA → DFA Conversion (Tab 2)
- **Step-by-step Subset Construction Algorithm**
- Animated step log with highlighted transitions
- Live-updating subset construction table
- Resulting DFA graph rendered in real-time as steps progress
- "Run All" to see full conversion at once

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



## Run Locally

```bash
npx serve . -p 3000
# Open http://localhost:3000
```

## Deploy to Vercel

```bash
npx vercel --prod
```

## Algorithms Implemented

| Concept | Algorithm |
|---------|-----------|
| ε-closure | BFS/DFS from each state on ε-transitions |
| NFA → DFA | Subset Construction (Powerset Algorithm) |
| DFA Minimization | Table-Filling (Myhill-Nerode Equivalence) |
| String Acceptance | DFA simulation with transition function |

## Example NFA

The default example recognizes strings **ending in "ab"** over alphabet {a, b}:
- States: q0 (start), q1, q2 (accept)  
- Transitions: q0→q0 on a, q0→q0 on b, q0→q1 on a, q1→q2 on b

This NFA is nondeterministic (two transitions from q0 on 'a').
