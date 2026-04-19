/* ══════════════════════════════════════════════════════════
   graph.js — Canvas-based Graph Renderer for Automata
   Supports: pan (drag), zoom (wheel), fit-to-view, animation
   ══════════════════════════════════════════════════════════ */

'use strict';

const STATE_RADIUS = 28;
const ARROW_SIZE = 10;
const SELF_LOOP_HEIGHT = 55;

const COLORS = {
  grid: 'rgba(255,255,255,0.025)',
  text: '#f0f0fa',

  stateDefaultFill: 'rgba(139, 92, 246, 0.12)',
  stateDefaultStroke: '#8b5cf6',
  stateStartFill: 'rgba(34, 211, 238, 0.1)',
  stateStartStroke: '#22d3ee',
  stateAcceptFill: 'rgba(74, 222, 128, 0.1)',
  stateAcceptStroke: '#4ade80',
  stateCurrentFill: 'rgba(251, 191, 36, 0.18)',
  stateCurrentStroke: '#fbbf24',
  stateDeadFill: 'rgba(248, 113, 113, 0.12)',
  stateDead: '#f87171',

  edgeDefault: 'rgba(139, 92, 246, 0.55)',
  edgeActive: '#fbbf24',
  edgeEpsilon: 'rgba(34, 211, 238, 0.6)',
  startArrow: '#22d3ee',
};

class GraphRenderer {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;
    this.opts = { editable: false, ...opts };

    // Automaton data
    this.automaton = null;
    this.highlightedStates = new Set();
    this.highlightedEdge = null;
    this.currentState = null;
    this.deadState = false;
    this.animFrame = null;

    // Editable-mode interaction
    this.dragState = null;
    this.edgeDrawing = null;
    this.mode = 'select';
    this.hoveredState = null;
    this.selectedState = null;

    // ── Pan / Zoom state ──────────────────────────────────
    this.panX = 0;
    this.panY = 0;
    this.scale = 1;
    this._isPanning = false;
    this._panStart = null;
    this.mouseX = null;
    this.mouseY = null;

    this.pulsePhase = 0;
    this._animate();
    this._setupResize();
    this._setupPanZoom();
  }

  // ── Automaton ─────────────────────────────────────────
  setAutomaton(auto, autoFit = true) {
    this.automaton = auto;
    this.highlightedStates.clear();
    this.highlightedEdge = null;
    this.currentState = null;
    this.deadState = false;
    if (autoFit && auto && auto.states.size > 0) {
      // Defer to next frame so canvas dimensions are settled
      requestAnimationFrame(() => this.fitView());
    }
  }

  // ── Resize ─────────────────────────────────────────────
  resize() {
    const wrapper = this.canvas.parentElement;
    const w = wrapper.clientWidth;
    const h = wrapper.clientHeight;
    if (!w || !h) return;
    this.canvas.width = w * this.dpr;
    this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.scale(this.dpr, this.dpr);
    this.W = w;
    this.H = h;
  }

  _setupResize() {
    const ro = new ResizeObserver(() => {
      this.resize();
      if (this.automaton) this.fitView();
    });
    ro.observe(this.canvas.parentElement);
    this.resize();
  }

  // ── Fit-to-view ────────────────────────────────────────
  fitView(padding = 60) {
    if (!this.automaton || this.automaton.states.size === 0) return;
    const W = this.W || 400;
    const H = this.H || 300;

    const states = [...this.automaton.states.values()];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const s of states) {
      minX = Math.min(minX, s.x - STATE_RADIUS);
      minY = Math.min(minY, s.y - STATE_RADIUS - SELF_LOOP_HEIGHT);
      maxX = Math.max(maxX, s.x + STATE_RADIUS + 40); // 40 for start arrow
      maxY = Math.max(maxY, s.y + STATE_RADIUS);
    }

    const graphW = maxX - minX;
    const graphH = maxY - minY;
    if (graphW <= 0 || graphH <= 0) return;

    const scaleX = (W - padding * 2) / graphW;
    const scaleY = (H - padding * 2) / graphH;
    const newScale = Math.min(scaleX, scaleY, 1.4); // cap zoom-in at 140%

    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    this.scale = newScale;
    this.panX = W / 2 - cx * newScale;
    this.panY = H / 2 - cy * newScale;
  }

  // ── Pan / Zoom event setup ─────────────────────────────
  _setupPanZoom() {
    const c = this.canvas;

    // Wheel zoom
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { x, y } = this._getRawPos(e);
      const delta = e.deltaY < 0 ? 1.12 : (1 / 1.12);
      const newScale = Math.max(0.15, Math.min(4, this.scale * delta));
      // Zoom towards cursor
      this.panX = x - (x - this.panX) * (newScale / this.scale);
      this.panY = y - (y - this.panY) * (newScale / this.scale);
      this.scale = newScale;
    }, { passive: false });

    // Middle-click / right-click drag to pan (non-editable: also left-click on empty)
    c.addEventListener('mousedown', (e) => this._onMouseDown(e));
    c.addEventListener('mousemove', (e) => this._onMouseMove(e));
    c.addEventListener('mouseup',   (e) => this._onMouseUp(e));
    c.addEventListener('mouseleave', () => {
      this.hoveredState = null;
      this.mouseX = null;
      this._isPanning = false;
      this._panStart = null;
    });
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const { x, y } = this._getWorldPos(e);
      const hit = this._hitTest(x, y);
      if (hit) this.callbacks?.onStateOptions?.(hit);
    });
    c.addEventListener('dblclick', (e) => this._onDblClick(e));
  }

  // ── Coordinate helpers ──────────────────────────────────
  _getRawPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  // Convert screen → world coordinates
  _getWorldPos(e) {
    const { x, y } = this._getRawPos(e);
    return {
      x: (x - this.panX) / this.scale,
      y: (y - this.panY) / this.scale,
    };
  }

  _hitTest(wx, wy) {
    if (!this.automaton) return null;
    for (const [name, state] of this.automaton.states) {
      const dx = wx - state.x, dy = wy - state.y;
      if (dx * dx + dy * dy <= STATE_RADIUS * STATE_RADIUS) return name;
    }
    return null;
  }

  // ── Mouse handlers ──────────────────────────────────────
  _onDblClick(e) {
    const wp = this._getWorldPos(e);
    if (this.mode === 'addstate' || this.mode === 'select') {
      const hit = this._hitTest(wp.x, wp.y);
      if (!hit) this.callbacks?.onAddState?.(wp.x, wp.y);
      else this.callbacks?.onStateOptions?.(hit);
    }
  }

  _onMouseDown(e) {
    const raw = this._getRawPos(e);
    const wp  = this._getWorldPos(e);
    const hit = this._hitTest(wp.x, wp.y);

    if (e.button === 1 || e.button === 2) {
      // Middle/right click → always pan
      this._isPanning = true;
      this._panStart = { rawX: raw.x, rawY: raw.y, panX: this.panX, panY: this.panY };
      return;
    }

    if (this.mode === 'edge') {
      if (hit) {
        this.edgeDrawing = { from: hit };
        this.mouseX = wp.x; this.mouseY = wp.y;
      } else {
        // Left-drag empty space → pan in edge mode too
        this._isPanning = true;
        this._panStart = { rawX: raw.x, rawY: raw.y, panX: this.panX, panY: this.panY };
      }
    } else if (this.mode === 'select') {
      if (hit) {
        this.selectedState = hit;
        const s = this.automaton.states.get(hit);
        this.dragState = { name: hit, offsetX: wp.x - s.x, offsetY: wp.y - s.y };
      } else {
        this.selectedState = null;
        // Pan on empty space
        this._isPanning = true;
        this._panStart = { rawX: raw.x, rawY: raw.y, panX: this.panX, panY: this.panY };
      }
    } else {
      // addstate mode: pan on empty
      if (!hit) {
        this._isPanning = true;
        this._panStart = { rawX: raw.x, rawY: raw.y, panX: this.panX, panY: this.panY };
      }
    }
  }

  _onMouseMove(e) {
    const raw = this._getRawPos(e);
    const wp  = this._getWorldPos(e);
    this.mouseX = wp.x;
    this.mouseY = wp.y;
    this.hoveredState = this._hitTest(wp.x, wp.y);

    if (this._isPanning && this._panStart) {
      this.panX = this._panStart.panX + (raw.x - this._panStart.rawX);
      this.panY = this._panStart.panY + (raw.y - this._panStart.rawY);
    }

    if (this.dragState && this.automaton) {
      const state = this.automaton.states.get(this.dragState.name);
      if (state) {
        state.x = wp.x - this.dragState.offsetX;
        state.y = wp.y - this.dragState.offsetY;
      }
    }

    // Cursor
    const wrapper = this.canvas.parentElement;
    if (this._isPanning) wrapper.style.cursor = 'grabbing';
    else if (this.hoveredState) wrapper.style.cursor = 'pointer';
    else if (this.mode === 'addstate') wrapper.style.cursor = 'crosshair';
    else if (this.mode === 'edge') wrapper.style.cursor = 'cell';
    else wrapper.style.cursor = 'grab';
  }

  _onMouseUp(e) {
    const wp  = this._getWorldPos(e);
    const hit = this._hitTest(wp.x, wp.y);

    if (this.edgeDrawing) {
      if (hit) this.callbacks?.onAddEdge?.(this.edgeDrawing.from, hit);
      this.edgeDrawing = null;
    }
    this.dragState = null;
    this._isPanning = false;
    this._panStart = null;
  }

  setMode(mode) { this.mode = mode; }

  // ── Public highlight API ───────────────────────────────
  setCurrentState(stateName, dead = false) {
    this.currentState = stateName;
    this.deadState = dead;
  }
  setHighlightedStates(s) {
    this.highlightedStates = s instanceof Set ? s : new Set(s);
  }
  setHighlightedEdge(edge) { this.highlightedEdge = edge; }

  // ── Animation loop ─────────────────────────────────────
  _animate() {
    this.pulsePhase += 0.04;
    this.draw();
    this.animFrame = requestAnimationFrame(() => this._animate());
  }

  // ── Draw ───────────────────────────────────────────────
  draw() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const W = this.W || this.canvas.width / this.dpr;
    const H = this.H || this.canvas.height / this.dpr;

    ctx.clearRect(0, 0, W, H);
    this._drawGrid(ctx, W, H);

    if (!this.automaton || this.automaton.states.size === 0) return;

    // Apply pan/zoom transform
    ctx.save();
    ctx.translate(this.panX, this.panY);
    ctx.scale(this.scale, this.scale);

    this._drawEdges(ctx);
    this._drawStates(ctx);
    if (this.edgeDrawing && this.mouseX != null) this._drawEdgeDrawingIndicator(ctx);

    ctx.restore();

    // HUD: zoom level hint
    this._drawZoomHint(ctx, W, H);
  }

  _drawGrid(ctx, W, H) {
    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;
    // Draw grid in world space accounting for pan/zoom
    const step = 40;
    const startX = (((-this.panX / this.scale) % step) + step) % step;
    const startY = (((-this.panY / this.scale) % step) + step) % step;
    const ox = this.panX % (step * this.scale);
    const oy = this.panY % (step * this.scale);
    const gs = step * this.scale;

    for (let x = ox % gs; x < W; x += gs) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let y = oy % gs; y < H; y += gs) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
  }

  _drawZoomHint(ctx, W, H) {
    if (Math.abs(this.scale - 1) < 0.05) return; // don't show at 100%
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '11px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.round(this.scale * 100)}%`, W - 10, H - 8);
    ctx.restore();
  }

  _drawEdges(ctx) {
    if (!this.automaton) return;
    const transitions = this.automaton.transitionList ?? this.automaton.transitions;
    const edgeMap = new Map();
    for (const t of transitions) {
      const key = `${t.from}→${t.to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from: t.from, to: t.to, symbols: [] });
      edgeMap.get(key).symbols.push(t.symbol);
    }
    for (const [, edge] of edgeMap) {
      const fromState = this.automaton.states.get(edge.from);
      const toState   = this.automaton.states.get(edge.to);
      if (!fromState || !toState) continue;

      const label = edge.symbols.join(', ');
      const isActive = this.highlightedEdge &&
        this.highlightedEdge.from === edge.from &&
        (this.highlightedEdge.to === edge.to || edge.symbols.includes(this.highlightedEdge.symbol));
      const hasEpsilon = edge.symbols.includes('ε');

      if (edge.from === edge.to) {
        this._drawSelfLoop(ctx, fromState, label, isActive, hasEpsilon);
      } else {
        const reverseExists = edgeMap.has(`${edge.to}→${edge.from}`);
        this._drawEdge(ctx, fromState, toState, label, isActive, hasEpsilon, reverseExists);
      }
    }
  }

  _drawEdge(ctx, from, to, label, isActive, hasEpsilon, curved) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 1) return;

    const ux = dx/dist, uy = dy/dist;
    const nx = -uy,    ny =  ux;
    const sx = from.x + ux * STATE_RADIUS, sy = from.y + uy * STATE_RADIUS;
    const ex = to.x   - ux * STATE_RADIUS, ey = to.y   - uy * STATE_RADIUS;

    const color = isActive ? COLORS.edgeActive : (hasEpsilon ? COLORS.edgeEpsilon : COLORS.edgeDefault);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = isActive ? 2.5 : 1.8;

    if (curved) {
      const bend = 40;
      const cpx = (sx+ex)/2 + nx*bend, cpy = (sy+ey)/2 + ny*bend;
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.quadraticCurveTo(cpx,cpy,ex,ey); ctx.stroke();
      const lx = (sx + 2*cpx + ex)/4, ly = (sy + 2*cpy + ey)/4;
      this._drawEdgeLabel(ctx, label, lx, ly, isActive, hasEpsilon);
      const t = 0.95;
      this._drawArrow(ctx,
        (1-t)*(1-t)*sx + 2*(1-t)*t*cpx + t*t*ex,
        (1-t)*(1-t)*sy + 2*(1-t)*t*cpy + t*t*ey,
        ex, ey, color);
    } else {
      ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke();
      this._drawEdgeLabel(ctx, label, (sx+ex)/2 + nx*14, (sy+ey)/2 + ny*14, isActive, hasEpsilon);
      this._drawArrow(ctx, sx, sy, ex, ey, color);
    }
  }

  _drawSelfLoop(ctx, state, label, isActive, hasEpsilon) {
    const color = isActive ? COLORS.edgeActive : (hasEpsilon ? COLORS.edgeEpsilon : COLORS.edgeDefault);
    ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.lineWidth = isActive ? 2.5 : 1.8;
    const x = state.x, y = state.y - STATE_RADIUS, lH = SELF_LOOP_HEIGHT;
    ctx.beginPath();
    ctx.moveTo(x - STATE_RADIUS*0.6, y);
    ctx.bezierCurveTo(x - STATE_RADIUS*1.8, y-lH, x + STATE_RADIUS*1.8, y-lH, x + STATE_RADIUS*0.6, y);
    ctx.stroke();
    this._drawEdgeLabel(ctx, label, x, y-lH-6, isActive, hasEpsilon);
    this._drawArrow(ctx, x + STATE_RADIUS*0.1, y-20, x + STATE_RADIUS*0.6, y, color);
  }

  _drawEdgeLabel(ctx, label, x, y, isActive, hasEpsilon) {
    const bg = isActive ? 'rgba(251,191,36,0.15)' :
               (hasEpsilon ? 'rgba(34,211,238,0.12)' : 'rgba(14,14,28,0.88)');
    const tc = isActive ? COLORS.edgeActive :
               (hasEpsilon ? COLORS.edgeEpsilon : COLORS.edgeDefault);
    ctx.font = 'bold 12px JetBrains Mono, monospace';
    const tw = ctx.measureText(label).width + 10;
    ctx.fillStyle = bg;
    roundRect(ctx, x - tw/2, y - 9, tw, 18, 4); ctx.fill();
    ctx.fillStyle = tc; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);
  }

  _drawArrow(ctx, fx, fy, tx, ty, color) {
    const a = Math.atan2(ty-fy, tx-fx), s = ARROW_SIZE;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - s*Math.cos(a - Math.PI/7), ty - s*Math.sin(a - Math.PI/7));
    ctx.lineTo(tx - s*Math.cos(a + Math.PI/7), ty - s*Math.sin(a + Math.PI/7));
    ctx.closePath(); ctx.fill();
  }

  _drawStates(ctx) {
    if (!this.automaton) return;
    for (const [name, state] of this.automaton.states) {
      this._drawState(ctx, state, {
        isHighlighted: this.highlightedStates.has(name),
        isCurrent:     this.currentState === name,
        isHovered:     this.hoveredState  === name,
        isSelected:    this.selectedState === name,
        isDead:        this.deadState && this.currentState === name,
      });
    }
  }

  _drawState(ctx, state, flags = {}) {
    const { isHighlighted, isCurrent, isHovered, isSelected, isDead } = flags;
    const { x, y, name, isStart, isAccept } = state;
    const R = STATE_RADIUS;
    const pulse = Math.sin(this.pulsePhase) * 0.5 + 0.5;

    let fill, stroke, glow, sw;
    if (isDead)              { fill=COLORS.stateDeadFill;    stroke=COLORS.stateDead;          glow='rgba(248,113,113,0.4)'; sw=2.5; }
    else if (isCurrent)      { fill=COLORS.stateCurrentFill; stroke=COLORS.stateCurrentStroke; glow=`rgba(251,191,36,${0.3+pulse*0.2})`; sw=2.5+pulse*0.5; }
    else if (isHovered||isSelected){ fill='rgba(139,92,246,0.2)'; stroke='#a78bfa'; glow='rgba(139,92,246,0.3)'; sw=2; }
    else if (isHighlighted)  { fill='rgba(251,191,36,0.1)';  stroke=COLORS.stateCurrentStroke; glow='rgba(251,191,36,0.2)'; sw=2; }
    else if (isStart&&isAccept){fill='rgba(139,92,246,0.12)';stroke='#a78bfa';                  glow='rgba(139,92,246,0.2)'; sw=2; }
    else if (isStart)        { fill=COLORS.stateStartFill;   stroke=COLORS.stateStartStroke;   glow='rgba(34,211,238,0.15)'; sw=2; }
    else if (isAccept)       { fill=COLORS.stateAcceptFill;  stroke=COLORS.stateAcceptStroke;  glow='rgba(74,222,128,0.15)'; sw=2; }
    else                     { fill=COLORS.stateDefaultFill; stroke=COLORS.stateDefaultStroke; glow='rgba(139,92,246,0.12)'; sw=1.8; }

    if (isCurrent || isHovered || isSelected || isHighlighted) {
      ctx.beginPath(); ctx.arc(x, y, R+10, 0, Math.PI*2);
      const grad = ctx.createRadialGradient(x, y, R, x, y, R+16);
      grad.addColorStop(0, glow); grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad; ctx.fill();
    }

    ctx.beginPath(); ctx.arc(x, y, R, 0, Math.PI*2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = sw; ctx.stroke();

    if (isAccept) {
      ctx.beginPath(); ctx.arc(x, y, R-5, 0, Math.PI*2);
      ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    }

    if (isStart) {
      const startX = x - R - 30;
      ctx.strokeStyle = COLORS.startArrow; ctx.fillStyle = COLORS.startArrow; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(x-R, y); ctx.stroke();
      this._drawArrow(ctx, startX, y, x-R, y, COLORS.startArrow);
    }

    // Label — auto-shrink font for long names
    const fontSize = name.length > 8 ? 8 : name.length > 5 ? 10 : name.length > 3 ? 11 : 13;
    ctx.fillStyle = COLORS.text;
    ctx.font = `600 ${fontSize}px Inter, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name, x, y);
  }

  _drawEdgeDrawingIndicator(ctx) {
    const fromState = this.automaton?.states.get(this.edgeDrawing?.from);
    if (!fromState) return;
    ctx.strokeStyle = 'rgba(139,92,246,0.6)';
    ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(fromState.x, fromState.y);
    ctx.lineTo(this.mouseX, this.mouseY); ctx.stroke();
    ctx.setLineDash([]);
  }

  // ── Interaction setup for editable NFA ────────────────
  enableInteraction(callbacks = {}) {
    this.callbacks = callbacks;
    // Events are already attached in _setupPanZoom
  }

  destroy() {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
  }
}

// ── Canvas helper ──────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x+r, y); ctx.lineTo(x+w-r, y);
  ctx.quadraticCurveTo(x+w, y, x+w, y+r);
  ctx.lineTo(x+w, y+h-r);
  ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
  ctx.lineTo(x+r, y+h);
  ctx.quadraticCurveTo(x, y+h, x, y+h-r);
  ctx.lineTo(x, y+r);
  ctx.quadraticCurveTo(x, y, x+r, y);
  ctx.closePath();
}

window.GraphRenderer = GraphRenderer;
