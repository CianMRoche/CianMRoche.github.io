// Plot rendering for Chi By Eye.
//
// One Plot instance manages one canvas + round. Call .render() any time
// the data or geometry changes. If the difficulty enables animation
// (hard: rotating errorbars, impossible: sampled gaussian dots), call
// .startAnimation(); otherwise the canvas is static and only redraws on
// resize / reveal change.
//
// Coordinate systems:
//   world x:  [0, 1]               normalized round x
//   world y:  [yMin, yMax]         (or log10 of those if logY)
//   pixel:    canvas-internal pixels (DPI-scaled)

// Plot region inset relative to canvas size (left/right/top/bottom).
// Used when compact=false. Compact mode (summary mini-plots) uses tight
// inset values computed in _plotRect.
const PAD_FULL    = { l: 44, r: 24, t: 32, b: 56 };
const PAD_COMPACT = { l: 14, r: 8,  t: 10, b: 14 };
// Number of polyline samples for the model curve.
const CURVE_SAMPLES = 240;
// Sampled-errorbar cloud (Impossible): how many live samples per data point.
const CLOUD_PER_POINT = 6;
// Avg lifetime of each cloud sample in ms.
const CLOUD_LIFETIME = 900;

export class Plot {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.compact = !!opts.compact;
    this.round = null;
    this.revealed = false;
    // Animation state
    this._rafId = null;
    this._lastFrameTime = 0;
    this._rotations = []; // current rotation per point (radians)
    this._rotRates = [];  // assigned at setRound
    this._cloud = [];     // array per point of array of {y, t0, life}
    // Geometry cache, rebuilt on resize
    this._w = 0;
    this._h = 0;
    this._dpr = 1;
    // Bound animation tick
    this._tick = this._tick.bind(this);
    // Style values pulled from CSS vars on each render so theme changes work.
    this._style = {};

    this._onResize = () => this._resize();
    window.addEventListener('resize', this._onResize);
    // Also observe the canvas itself for size changes that DON'T involve a
    // window resize — e.g. state transitions that hide/show the controls bar
    // or topbar, the reveal banner toggling, etc. Without this, the canvas
    // drawing buffer stays at the size from the last window resize while CSS
    // stretches it to fit the new layout, distorting text that's been drawn
    // into it (the bug where in-plot labels look horizontally elongated at
    // certain aspect ratios).
    if (typeof ResizeObserver !== 'undefined') {
      this._resizeObserver = new ResizeObserver(() => this._resize());
      this._resizeObserver.observe(this.canvas);
    }
    this._resize();
  }

  destroy() {
    this.stopAnimation();
    this.setInteractive(null); // detach any drag handlers
    window.removeEventListener('resize', this._onResize);
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }

  setRound(round, opts = {}) {
    this.round = round;
    this.revealed = false;
    this._userSigma = null;
    // Visibility flags — primarily for the tutorial, which reveals data
    // and then the model curve incrementally. Default: both visible.
    this._showCurve = opts.showCurve !== false;
    this._showData  = opts.showData  !== false;
    // Rotation rates per point — random for Hard, zero otherwise.
    // |rate| is uniform between a min and max floor, so no bar appears
    // stationary while none spins distractingly fast.
    const ROT_MIN = 0.7;   // rad/s — lower bound on |rate|
    const ROT_MAX = 1.7;   // rad/s — upper bound on |rate|
    this._rotRates = round.points.map(() => {
      if (!opts.rotate) return 0;
      const mag = ROT_MIN + Math.random() * (ROT_MAX - ROT_MIN);
      return Math.random() < 0.5 ? -mag : mag;
    });
    this._rotations = round.points.map(() => Math.random() * Math.PI * 2);
    // Initialize cloud samples for Impossible mode.
    this._cloud = round.points.map(() => []);
    this._sampled = !!opts.sampledErrorbars;
    this._needsAnim = this._rotRates.some(r => r !== 0) || this._sampled;
    this.render();
    if (this._needsAnim) this.startAnimation();
    else this.stopAnimation();
  }

  setRevealed(revealed, userSigma = null) {
    this.revealed = revealed;
    this._userSigma = userSigma;
    this.render();
  }

  setVisibility({ showCurve, showData } = {}) {
    if (showCurve !== undefined) this._showCurve = showCurve;
    if (showData  !== undefined) this._showData  = showData;
    this.render();
  }

  // Show or hide per-point χ² contribution labels (only meaningful when
  // revealed). Used by the tutorial.
  setChi2LabelsVisible(show) {
    this._showChi2Labels = !!show;
    this.render();
  }

  // Selection (sandbox box-select). The plot owns the rendering of the
  // highlight ring; the caller owns the canonical state via the
  // onSelectionChange callback.
  setSelection(indices) {
    this._selection = new Set(indices || []);
    this.render();
  }

  // Sandbox mode override. In this mode the renderer bypasses the
  // game-difficulty branches (sampled-only, rotating bars) and instead
  // honours the two explicit flags below directly. Clouds and the central
  // marker are always drawn together when requested — there's no "reveal"
  // transition. This is what lets the sandbox toggle "error bars" and
  // "cloud samples" independently.
  setSandboxMode(flags = {}) {
    this._sandboxMode = true;
    if (flags.barsVisible   !== undefined) this._barsVisible   = !!flags.barsVisible;
    if (flags.cloudsVisible !== undefined) this._cloudsVisible = !!flags.cloudsVisible;
    // Cloud sampling needs the RAF loop running to top up / age out
    // particles. Otherwise it can stay paused.
    this._needsAnim = !!this._cloudsVisible;
    if (this._needsAnim) this.startAnimation();
    else this.stopAnimation();
    this.render();
  }

  // Enable click-and-drag editing of points (sandbox mode).
  //
  // opts.onChange(idx, kind) is called whenever a point is mutated. `kind`
  // is 'point' (centre dot was dragged), 'errUp' or 'errDn' (an error-bar
  // cap was dragged). Callers should treat the round.points as mutable.
  //
  // Passing null disables interaction.
  setInteractive(opts) {
    // Tear down any existing handlers first so this is idempotent.
    if (this._interactiveHandlers) {
      const { down, move, up, leave } = this._interactiveHandlers;
      this.canvas.removeEventListener('pointerdown',   down);
      this.canvas.removeEventListener('pointermove',   move);
      this.canvas.removeEventListener('pointerup',     up);
      this.canvas.removeEventListener('pointercancel', up);
      this.canvas.removeEventListener('pointerleave',  leave);
      this._interactiveHandlers = null;
    }
    this._interactiveOpts = null;
    this._dragState = null;
    this.canvas.style.cursor = '';
    this.canvas.style.touchAction = '';
    if (!opts) return;

    this._interactiveOpts = opts;
    // Disable the browser's default touch gestures on the canvas so that
    // dragging a point on mobile doesn't scroll the page.
    this.canvas.style.touchAction = 'none';

    const down  = (e) => this._onPointerDown(e);
    const move  = (e) => this._onPointerMove(e);
    const up    = (e) => this._onPointerUp(e);
    const leave = ()  => { if (!this._dragState) this.canvas.style.cursor = ''; };
    this.canvas.addEventListener('pointerdown',   down);
    this.canvas.addEventListener('pointermove',   move);
    this.canvas.addEventListener('pointerup',     up);
    this.canvas.addEventListener('pointercancel', up);
    this.canvas.addEventListener('pointerleave',  leave);
    this._interactiveHandlers = { down, move, up, leave };
  }

  // --- internal: pointer position → canvas-internal pixels ---
  _eventToCanvasPx(e) {
    const rect = this.canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    return { px: cssX * this._dpr, py: cssY * this._dpr };
  }

  // Hit test: returns the nearest interactable element under the cursor
  // (or null). Returns { kind: 'point' | 'errUp' | 'errDn', idx } and the
  // distance for use by the caller.
  _hitTest(px, py) {
    if (!this.round || !this.round.points) return null;
    const R = this._plotRect();
    const dpr = this._dpr;
    // Tap targets — generous on touch, tight enough to disambiguate points.
    const POINT_R = 14 * dpr;
    const CAP_R   = 12 * dpr;
    let best = null;
    for (let i = 0; i < this.round.points.length; i++) {
      const p = this.round.points[i];
      const cx = this._xToPx(p.x, R);
      const cy = this._yToPx(p.yObs, R);
      const dCenter = Math.hypot(px - cx, py - cy);
      if (dCenter <= POINT_R && (!best || dCenter < best.dist)) {
        best = { kind: 'point', idx: i, dist: dCenter };
      }
      // Cap hit tests: only when error-bar visuals exist (vertical bars).
      const { upPx, dnPx } = this._dyToPxAt(p.yObs, p.err, R);
      const dUp = Math.hypot(px - cx, py - upPx);
      const dDn = Math.hypot(px - cx, py - dnPx);
      // Caps only count if pointer is clearly nearer the cap than the center
      // (so the center grabs first when the bar is short).
      if (dUp <= CAP_R && dUp < dCenter && (!best || dUp < best.dist)) {
        best = { kind: 'errUp', idx: i, dist: dUp };
      }
      if (dDn <= CAP_R && dDn < dCenter && (!best || dDn < best.dist)) {
        best = { kind: 'errDn', idx: i, dist: dDn };
      }
    }
    return best;
  }

  _onPointerDown(e) {
    if (!this._interactiveOpts) return;
    const { px, py } = this._eventToCanvasPx(e);
    const hit = this._hitTest(px, py);
    if (hit) {
      e.preventDefault();
      const sel = this._selection || new Set();
      const hitIsSelected = sel.has(hit.idx);
      const R = this._plotRect();
      // If the hit point is part of the current selection, the drag moves
      // (or resizes) the WHOLE group; otherwise it's a single-point drag
      // and the selection is cleared first (since the user is "leaving"
      // it to act on a different point).
      if (hitIsSelected) {
        // Snapshot the starting pixel position (or err) of every selected
        // point so the move/resize can be applied as a uniform delta or a
        // single shared value at every move event.
        const initial = [];
        for (const idx of sel) {
          const p = this.round.points[idx];
          initial.push({
            idx,
            px: this._xToPx(p.x, R),
            py: this._yToPx(p.yObs, R),
            err: p.err,
          });
        }
        this._dragState = {
          kind: (hit.kind === 'errUp' || hit.kind === 'errDn') ? 'groupErr' : 'groupMove',
          anchorIdx: hit.idx,
          anchorKind: hit.kind,           // for groupErr: which cap was grabbed
          startPx: px, startPy: py,
          initial,
        };
      } else {
        // Dragging a non-selected point: clear the selection (acts as a
        // visual confirmation that the user has switched focus to a
        // different point) and fall back to the single-element drag path.
        if (sel.size && this._interactiveOpts.onSelectionChange) {
          this._selection = new Set();
          this._interactiveOpts.onSelectionChange([]);
        } else {
          this._selection = new Set();
        }
        this._dragState = hit;
      }
      // Resize cursor for cap drags, grabbing for whole-point moves.
      this.canvas.style.cursor =
        (hit.kind === 'errUp' || hit.kind === 'errDn') ? 'ns-resize' : 'grabbing';
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
      this.render();
      return;
    }
    // Not over any interactable element — record a candidate click so
    // pointerup can decide whether it was a click-to-add or just a
    // missed press / scroll attempt. Only count if the press lands inside
    // the plot rect (so margin / axis presses don't create points).
    const R = this._plotRect();
    const insidePlot = (px >= R.x0 && px <= R.x1 && py >= R.y0 && py <= R.y1);
    if (insidePlot && this._interactiveOpts.onClickEmpty) {
      e.preventDefault();
      this._pendingClick = { px, py, pointerId: e.pointerId };
      try { this.canvas.setPointerCapture(e.pointerId); } catch (_) {}
    }
  }

  _onPointerMove(e) {
    if (!this._interactiveOpts) return;
    if (this._dragState) {
      const { px, py } = this._eventToCanvasPx(e);
      const R = this._plotRect();
      const kind = this._dragState.kind;

      if (kind === 'groupMove') {
        // Translate every selected point by the same PIXEL delta. Working
        // in pixel space (and converting back to world via _pxToX / _pxToY)
        // means the group moves visually together on both linear and log
        // axes — a constant log-y shift looks right, even though that's a
        // multiplicative shift in world units.
        const dPx = px - this._dragState.startPx;
        const dPy = py - this._dragState.startPy;
        for (const ip of this._dragState.initial) {
          const newPx = ip.px + dPx;
          const newPy = ip.py + dPy;
          const cx = Math.max(R.x0, Math.min(R.x1, newPx));
          const cy = Math.max(R.y0, Math.min(R.y1, newPy));
          const p = this.round.points[ip.idx];
          p.x    = Math.max(0, Math.min(1, this._pxToX(cx, R)));
          p.yObs = this._pxToY(cy, R);
        }
        this.render();
        if (this._interactiveOpts.onChange) {
          this._interactiveOpts.onChange(this._dragState.anchorIdx, 'groupMove');
        }
        return;
      }

      if (kind === 'groupErr') {
        // Compute the new err FROM THE ANCHOR POINT (the cap actually
        // being grabbed) and broadcast that value to every selected point.
        // This matches the "if one error bar is altered in the selection
        // then the others all get changed to match" rule.
        const cy = Math.max(R.y0, Math.min(R.y1, py));
        const wy = this._pxToY(cy, R);
        const anchor = this.round.points[this._dragState.anchorIdx];
        const newErr = Math.max(
          1e-6,
          this._dragState.anchorKind === 'errUp'
            ? (wy - anchor.yObs)
            : (anchor.yObs - wy)
        );
        for (const ip of this._dragState.initial) {
          this.round.points[ip.idx].err = newErr;
        }
        this.render();
        if (this._interactiveOpts.onChange) {
          this._interactiveOpts.onChange(this._dragState.anchorIdx, 'groupErr');
        }
        return;
      }

      // Single-point drag (point center or one error-bar cap).
      const cx = Math.max(R.x0, Math.min(R.x1, px));
      const cy = Math.max(R.y0, Math.min(R.y1, py));
      const wx = this._pxToX(cx, R);
      const wy = this._pxToY(cy, R);
      const p = this.round.points[this._dragState.idx];
      if (kind === 'point') {
        p.x    = Math.max(0, Math.min(1, wx));
        p.yObs = wy;
      } else if (kind === 'errUp') {
        const newErr = Math.max(1e-6, wy - p.yObs);
        p.err = newErr;
      } else if (kind === 'errDn') {
        const newErr = Math.max(1e-6, p.yObs - wy);
        p.err = newErr;
      }
      this.render();
      if (this._interactiveOpts.onChange) {
        this._interactiveOpts.onChange(this._dragState.idx, kind);
      }
      return;
    }
    // Active marquee box-select drag (started from a pending click that
    // moved past the threshold). Update the rectangle's "current" corner.
    if (this._boxSelect) {
      const { px, py } = this._eventToCanvasPx(e);
      this._boxSelect.currentPx = px;
      this._boxSelect.currentPy = py;
      this.canvas.style.cursor = 'crosshair';
      this.render();
      return;
    }
    // No active drag — a pending click that moves past the threshold
    // transitions into a marquee box-select (if the caller registered an
    // onBoxSelect handler); otherwise it's cancelled (treated as a
    // scroll attempt or missed press).
    if (this._pendingClick) {
      const { px, py } = this._eventToCanvasPx(e);
      const dx = px - this._pendingClick.px;
      const dy = py - this._pendingClick.py;
      if (Math.hypot(dx, dy) > 6 * this._dpr) {
        if (this._interactiveOpts.onBoxSelect) {
          this._boxSelect = {
            startPx:   this._pendingClick.px,
            startPy:   this._pendingClick.py,
            currentPx: px,
            currentPy: py,
            pointerId: this._pendingClick.pointerId,
          };
          this._pendingClick = null;
          this.canvas.style.cursor = 'crosshair';
          this.render();
        } else {
          try { this.canvas.releasePointerCapture(this._pendingClick.pointerId); } catch (_) {}
          this._pendingClick = null;
        }
      }
    } else {
      // Otherwise: update the hover cursor based on what's under the
      // pointer right now. ns-resize advertises "drag this cap to change
      // the error-bar length"; grab advertises "drag this point"; copy
      // advertises "click to add a new point here".
      const { px, py } = this._eventToCanvasPx(e);
      const hit = this._hitTest(px, py);
      let cursor = '';
      if (hit) {
        cursor = (hit.kind === 'errUp' || hit.kind === 'errDn') ? 'ns-resize' : 'grab';
      } else if (this._interactiveOpts.onClickEmpty) {
        cursor = 'copy';
      }
      this.canvas.style.cursor = cursor;
    }
  }

  _onPointerUp(e) {
    // End-of-drag cleanup, if applicable.
    if (this._dragState) {
      this._dragState = null;
      this.canvas.style.cursor = '';
      try { this.canvas.releasePointerCapture(e.pointerId); } catch (_) {}
      if (this._interactiveOpts && this._interactiveOpts.onRelease) {
        this._interactiveOpts.onRelease();
      }
      return;
    }
    // End of marquee box-select. Collect the indices of all points whose
    // CENTRES sit inside the rect (in pixel space, regardless of axis
    // transform) and hand them off to the caller. The renderer's
    // selection-rectangle overlay clears on the next render.
    if (this._boxSelect && this._interactiveOpts && this._interactiveOpts.onBoxSelect) {
      const R = this._plotRect();
      const { startPx, startPy, currentPx, currentPy, pointerId } = this._boxSelect;
      const xMin = Math.min(startPx, currentPx);
      const xMax = Math.max(startPx, currentPx);
      const yMin = Math.min(startPy, currentPy);
      const yMax = Math.max(startPy, currentPy);
      const indices = [];
      if (this.round && this.round.points) {
        for (let i = 0; i < this.round.points.length; i++) {
          const p = this.round.points[i];
          const cx = this._xToPx(p.x, R);
          const cy = this._yToPx(p.yObs, R);
          if (cx >= xMin && cx <= xMax && cy >= yMin && cy <= yMax) {
            indices.push(i);
          }
        }
      }
      try { this.canvas.releasePointerCapture(pointerId); } catch (_) {}
      this._boxSelect = null;
      this.canvas.style.cursor = '';
      this._interactiveOpts.onBoxSelect(indices);
      // Don't return — fall through to a final render so the rectangle
      // disappears even if the callback didn't trigger one itself.
      this.render();
      return;
    }
    // Click-to-add: pointer was pressed inside the plot rect and didn't
    // move beyond the click threshold. Convert to world coords and fire
    // the callback.
    if (this._pendingClick && this._interactiveOpts && this._interactiveOpts.onClickEmpty) {
      const R = this._plotRect();
      const wx = this._pxToX(this._pendingClick.px, R);
      const wy = this._pxToY(this._pendingClick.py, R);
      try { this.canvas.releasePointerCapture(this._pendingClick.pointerId); } catch (_) {}
      this._pendingClick = null;
      this._interactiveOpts.onClickEmpty(wx, wy);
    }
  }

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(r.width  * dpr));
    const h = Math.max(1, Math.floor(r.height * dpr));
    if (w === this._w && h === this._h && dpr === this._dpr) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
    this.render();
  }

  _readStyle() {
    const cs = getComputedStyle(this.canvas);
    const get = (v, fallback) => (cs.getPropertyValue(v).trim() || fallback);
    this._style = {
      bg:      get('--plot-bg',      '#ffffff'),
      fg:      get('--plot-fg',      '#374151'),
      axis:    get('--plot-axis',    '#9ca3af'),
      muted:   get('--plot-muted',   '#6b7280'),
      curve:   get('--plot-curve',   '#2563eb'),
      point:   get('--plot-point',   '#111827'),
      err:     get('--plot-err',     'rgba(17,24,39,0.55)'),
      goodLo:  get('--plot-good',    '#10b981'), // low chi² contribution
      midLo:   get('--plot-mid',     '#f59e0b'),
      badHi:   get('--plot-bad',     '#ef4444'), // high chi² contribution
      info:    get('--plot-info',    '#9ca3af'),
      cloud:   get('--plot-cloud',   '#374151'),
    };
  }

  _plotRect() {
    const dpr = this._dpr;
    const P = this.compact ? PAD_COMPACT : PAD_FULL;
    const x0 = P.l * dpr;
    const y0 = P.t * dpr;
    const x1 = this._w - P.r * dpr;
    const y1 = this._h - P.b * dpr;
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
  }

  _xToPx(x, R) { return R.x0 + x * R.w; }
  _yToPx(y, R) {
    const r = this.round;
    if (r.logY) {
      const a = Math.log10(r.yMin), b = Math.log10(r.yMax);
      const t = (Math.log10(y) - a) / (b - a);
      return R.y1 - t * R.h;
    }
    const t = (y - r.yMin) / (r.yMax - r.yMin);
    return R.y1 - t * R.h;
  }
  // Inverse coordinate transforms — pixel → world. Used by the sandbox
  // drag handlers. Pixel inputs are canvas-internal pixels (DPI-scaled),
  // the same units _xToPx / _yToPx return.
  _pxToX(px, R) {
    return (px - R.x0) / R.w;
  }
  _pxToY(py, R) {
    const r = this.round;
    const t = (R.y1 - py) / R.h;
    if (r.logY) {
      const a = Math.log10(r.yMin), b = Math.log10(r.yMax);
      return Math.pow(10, a + t * (b - a));
    }
    return r.yMin + t * (r.yMax - r.yMin);
  }
  // Returns the pixel y positions of the upper and lower edges of an error
  // bar centered at yWorld with linear half-width errWorld. The error is
  // always in linear y units (a stated measurement uncertainty). On a log
  // axis, the upper and lower pixel offsets are naturally asymmetric, with
  // the lower bar appearing longer in pixel space (since log10(y+e) - log10(y)
  // < log10(y) - log10(y-e) for the same linear e).
  //
  // For log axes, clamp the lower edge at the bottom of the displayed range
  // (and flag it) when y - e would be ≤ 0 or below the axis floor.
  _dyToPxAt(yWorld, errWorld, R) {
    const r = this.round;
    const upY = yWorld + errWorld;
    const dnY = yWorld - errWorld;
    if (r.logY) {
      const upPx = this._yToPx(Math.max(r.yMin * 0.99, upY), R);
      let dnPx, dnClipped = false;
      if (dnY <= 0 || dnY < r.yMin) {
        dnPx = R.y1; // bottom of axis
        dnClipped = true;
      } else {
        dnPx = this._yToPx(dnY, R);
      }
      return { upPx, dnPx, dnClipped };
    }
    return {
      upPx: this._yToPx(upY, R),
      dnPx: this._yToPx(dnY, R),
      dnClipped: false,
    };
  }

  render() {
    if (!this.round) return;
    this._readStyle();
    const ctx = this.ctx;
    const dpr = this._dpr;
    const R = this._plotRect();
    // Clear
    ctx.fillStyle = this._style.bg;
    ctx.fillRect(0, 0, this._w, this._h);

    this._drawAxes(R);
    if (this._showCurve) this._drawCurve(R);
    if (this._showData)  this._drawData(R);
    if (this._boxSelect) this._drawSelectionRect(R);
  }

  _drawSelectionRect(R) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const S = this._style;
    const { startPx, startPy, currentPx, currentPy } = this._boxSelect;
    const x = Math.min(startPx, currentPx);
    const y = Math.min(startPy, currentPy);
    const w = Math.abs(currentPx - startPx);
    const h = Math.abs(currentPy - startPy);
    // Translucent red fill + dashed red border so it reads as "these will
    // be deleted on release", aligning with the chi² high-contribution
    // colour used elsewhere in the plot.
    ctx.save();
    ctx.fillStyle = 'rgba(239, 68, 68, 0.10)';
    ctx.strokeStyle = S.badHi || '#ef4444';
    ctx.lineWidth = 1.5 * dpr;
    ctx.setLineDash([6 * dpr, 4 * dpr]);
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
    ctx.restore();
  }

  _drawAxes(R) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const S = this._style;
    ctx.strokeStyle = S.fg;
    ctx.lineWidth = 1.5 * dpr;
    ctx.lineCap = 'square';
    ctx.beginPath();
    // X axis
    ctx.moveTo(R.x0, R.y1);
    ctx.lineTo(R.x1, R.y1);
    // Y axis
    ctx.moveTo(R.x0, R.y0);
    ctx.lineTo(R.x0, R.y1);
    ctx.stroke();

    // Ticks — darker, slightly thicker, a hair longer
    ctx.strokeStyle = S.fg;
    ctx.lineWidth = 1.2 * dpr;
    const tickLen = 7 * dpr;
    ctx.beginPath();
    // x ticks (8 minor ticks evenly spaced)
    const xTicks = 8;
    for (let i = 0; i <= xTicks; i++) {
      const px = R.x0 + (i / xTicks) * R.w;
      ctx.moveTo(px, R.y1);
      ctx.lineTo(px, R.y1 + tickLen);
    }
    // y ticks: log-style if logY else evenly spaced
    if (this.round.logY) {
      const a = Math.log10(this.round.yMin), b = Math.log10(this.round.yMax);
      const decadeLo = Math.ceil(a), decadeHi = Math.floor(b);
      // Major decade ticks
      for (let d = decadeLo; d <= decadeHi; d++) {
        const py = this._yToPx(Math.pow(10, d), R);
        ctx.moveTo(R.x0 - tickLen, py);
        ctx.lineTo(R.x0, py);
      }
      // Minor 2..9 within each decade
      for (let d = Math.floor(a); d <= Math.ceil(b); d++) {
        for (let m = 2; m <= 9; m++) {
          const yy = m * Math.pow(10, d);
          if (yy < this.round.yMin || yy > this.round.yMax) continue;
          const py = this._yToPx(yy, R);
          ctx.moveTo(R.x0 - tickLen * 0.6, py);
          ctx.lineTo(R.x0, py);
        }
      }
    } else {
      const yTicks = 6;
      for (let i = 0; i <= yTicks; i++) {
        const py = R.y0 + (i / yTicks) * R.h;
        ctx.moveTo(R.x0 - tickLen, py);
        ctx.lineTo(R.x0, py);
      }
    }
    ctx.stroke();

    // Axis labels (variable names) — skipped in compact mode
    if (!this.compact) {
      const fontPx = 14 * dpr;
      ctx.fillStyle = S.fg;
      ctx.font = `500 ${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.round.labels.x, (R.x0 + R.x1) / 2, R.y1 + 26 * dpr);
      ctx.save();
      ctx.translate(R.x0 - 22 * dpr, (R.y0 + R.y1) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(this.round.labels.y, 0, 0);
      ctx.restore();
    }
  }

  _drawCurve(R) {
    const ctx = this.ctx;
    const S = this._style;
    ctx.strokeStyle = S.curve;
    ctx.lineWidth = 1.8 * this._dpr;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= CURVE_SAMPLES; i++) {
      const x = i / CURVE_SAMPLES;
      const y = this.round.f(x);
      if (this.round.logY && y <= 0) continue;
      const px = this._xToPx(x, R);
      const py = this._yToPx(y, R);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }

  _chi2ContribColor(contrib) {
    // Map a single point's (residual/err)^2 to a color:
    //   contrib <= 1 -> green   (consistent within ~1 sigma)
    //   contrib ~  4 -> amber   (~2 sigma)
    //   contrib >= 9 -> red     (>= 3 sigma)
    const S = this._style;
    const stops = [
      { v: 0, c: S.goodLo },
      { v: 4, c: S.midLo  },
      { v: 9, c: S.badHi  },
      { v: 25, c: S.badHi },
    ];
    for (let i = 1; i < stops.length; i++) {
      if (contrib <= stops[i].v) {
        const t = (contrib - stops[i-1].v) / (stops[i].v - stops[i-1].v);
        return lerpColor(stops[i-1].c, stops[i].c, t);
      }
    }
    return S.badHi;
  }

  _drawData(R) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const S = this._style;
    const r = this.round;

    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      const px = this._xToPx(p.x, R);
      const py = this._yToPx(p.yObs, R);

      // Compute χ² contribution if revealed (or always, in sandbox mode —
      // where coloring gives live feedback as the user drags points around).
      // Both linear-y and log-y rounds now use linear residuals (matching the
      // chi² computation in round.js); the only difference is how the point is
      // *displayed*, not how its contribution is measured.
      const showContrib = this.revealed || this._sandboxMode;
      let contrib = null;
      let pointColor = S.point;
      if (showContrib) {
        const resid = p.yObs - p.yTrue;
        contrib = (resid / p.err) ** 2;
        pointColor = this._chi2ContribColor(contrib);
      }

      if (this._sandboxMode) {
        // Sandbox: explicit toggle for the bar, central point always shown.
        if (this._barsVisible) {
          this._drawVerticalErrorbar(px, py, p, R, pointColor);
        }
        this._drawPoint(px, py, pointColor);
        // Highlight ring for selected points (drawn AFTER the point so it
        // sits on top of the bar caps as well).
        if (this._selection && this._selection.has(i)) {
          this._drawSelectionRing(px, py);
        }
      } else if (this._sampled && !this.revealed) {
        // Impossible mode: do NOT draw the central point. Just the gaussian
        // cloud, drawn by _drawClouds(). Show nothing here.
      } else if (this._rotRates[i] !== 0 && !this.revealed) {
        // Hard mode: rotating error bar; central point visible.
        this._drawRotatedErrorbar(px, py, p, this._rotations[i], R, pointColor);
      } else {
        // Standard vertical errorbars + central point.
        this._drawVerticalErrorbar(px, py, p, R, this.revealed ? pointColor : S.err);
        this._drawPoint(px, py, pointColor);
      }

      // Optional per-point χ² contribution label (tutorial).
      // Format: "(±X.X σᵢ)² → Y.Y" — shows the signed residual in units of the
      // point's own error (σᵢ, distinct from the round's overall tension σ)
      // and the squared contribution to χ². Lets readers see both the visual
      // residual-in-sigmas and the contribution at once.
      //
      // Layout: the label is rotated 90° counter-clockwise (reads bottom-to-
      // top, like a y-axis title) and placed either above the upper error-bar
      // cap or below the lower one — whichever side has more vertical room.
      // This avoids the horizontal overlap with the curve and with neighboring
      // points that the previous side-of-point layout had.
      if (this.revealed && this._showChi2Labels && contrib != null) {
        const ctx = this.ctx;
        const dpr = this._dpr;
        const ratio = (p.yObs - p.yTrue) / p.err;
        const ratioStr = (ratio >= 0 ? '+' : '−') + Math.abs(ratio).toFixed(1);
        const contribStr = contrib < 1 ? contrib.toFixed(2) : contrib.toFixed(1);
        const txt = `(${ratioStr}σᵢ)² → ${contribStr}`;
        ctx.font = `600 ${10.5 * dpr}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
        ctx.fillStyle = pointColor;

        // Where the error-bar caps live (clamped to the axis for log y).
        // We anchor the label just outside the cap so it never overlaps the
        // bar or the central marker.
        const { upPx, dnPx } = this._dyToPxAt(p.yObs, p.err, R);
        const clearance = 8 * dpr;

        // Vertical span the rotated text will occupy = its horizontal width.
        const labelW = ctx.measureText(txt).width;

        // Available room above the upper cap vs below the lower cap.
        const roomAbove = (upPx - R.y0) - clearance;
        const roomBelow = (R.y0 + R.h - dnPx) - clearance;

        // Prefer above if the label fits; otherwise below if it fits; if
        // neither side has enough room, hug whichever side has more.
        let placeAbove;
        if (labelW <= roomAbove)      placeAbove = true;
        else if (labelW <= roomBelow) placeAbove = false;
        else                          placeAbove = roomAbove >= roomBelow;

        ctx.save();
        ctx.textBaseline = 'middle';
        // rotate(-π/2) maps canvas +x to screen "up", so a left-aligned
        // string drawn at the origin reads bottom-to-top extending upward.
        // For below-the-point placement we right-align so the END of the
        // string sits at the anchor (just below the lower cap) and the rest
        // extends further down — still reading bottom-to-top.
        if (placeAbove) {
          ctx.translate(px, upPx - clearance);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'left';
        } else {
          ctx.translate(px, dnPx + clearance);
          ctx.rotate(-Math.PI / 2);
          ctx.textAlign = 'right';
        }
        ctx.fillText(txt, 0, 0);
        ctx.restore();
      }
    }

    // Clouds: game-mode (Impossible while unrevealed) or sandbox-mode
    // explicit toggle. Both paths share the same _drawClouds renderer.
    if (this._sandboxMode && this._cloudsVisible) {
      this._drawClouds(R);
    } else if (this._sampled && !this.revealed) {
      this._drawClouds(R);
    }
  }

  _drawVerticalErrorbar(px, py, p, R, color) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const { upPx, dnPx, dnClipped } = this._dyToPxAt(p.yObs, p.err, R);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 * dpr;
    const cap = 5 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, upPx);
    ctx.lineTo(px, dnPx);
    // upper cap
    ctx.moveTo(px - cap, upPx); ctx.lineTo(px + cap, upPx);
    // lower cap or downward arrow if clipped (extends below visible range)
    if (dnClipped) {
      // Downward open arrowhead
      ctx.moveTo(px - cap, dnPx - cap);
      ctx.lineTo(px,       dnPx);
      ctx.lineTo(px + cap, dnPx - cap);
    } else {
      ctx.moveTo(px - cap, dnPx); ctx.lineTo(px + cap, dnPx);
    }
    ctx.stroke();
  }

  _drawRotatedErrorbar(px, py, p, angle, R, pointColor) {
    // Length of the errorbar in pixels: same as the vertical span would be,
    // measured from center to top edge (in pixels). Use the average of up and
    // down half-spans (in case of log axes, these are unequal).
    const { upPx, dnPx } = this._dyToPxAt(p.yObs, p.err, R);
    const halfLen = 0.5 * (Math.abs(py - upPx) + Math.abs(dnPx - py));

    const dx = Math.cos(angle) * halfLen;
    const dy = Math.sin(angle) * halfLen;
    const ctx = this.ctx;
    const dpr = this._dpr;
    ctx.strokeStyle = this._style.err;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(px - dx, py - dy);
    ctx.lineTo(px + dx, py + dy);
    // caps perpendicular to bar
    const cap = 5 * dpr;
    const nx = -dy / halfLen * cap;
    const ny =  dx / halfLen * cap;
    ctx.moveTo(px - dx - nx, py - dy - ny);
    ctx.lineTo(px - dx + nx, py - dy + ny);
    ctx.moveTo(px + dx - nx, py + dy - ny);
    ctx.lineTo(px + dx + nx, py + dy + ny);
    ctx.stroke();
    this._drawPoint(px, py, pointColor);
  }

  _drawPoint(px, py, color) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(px, py, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Selection highlight ring around a point. Drawn as a translucent
  // accent-coloured halo so it's clearly distinct from the chi²
  // contribution colour underneath but doesn't completely hide it.
  _drawSelectionRing(px, py) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const S = this._style;
    ctx.save();
    ctx.strokeStyle = S.curve || '#2563eb';   // accent colour
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = 2 * dpr;
    ctx.beginPath();
    ctx.arc(px, py, 8 * dpr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  _drawClouds(R) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const r = this.round;
    ctx.fillStyle = this._style.cloud;
    const now = performance.now();
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      const px = this._xToPx(p.x, R);
      const samples = this._cloud[i];
      for (const s of samples) {
        const age = (now - s.t0) / s.life;
        if (age < 0 || age > 1) continue;
        // Fade in then out: alpha curve peaks at age=0.5
        const alpha = Math.sin(age * Math.PI) * 0.55;
        // s.dy is in linear y units (drawn from N(0, p.err) at sample time).
        const yy = p.yObs + s.dy;
        // For log y axes, skip samples that fell on or below 0 since they
        // can't be mapped to a log y position.
        if (r.logY && yy <= 0) continue;
        const py = this._yToPx(yy, R);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  // (info text now lives in DOM HUD overlays managed by main.js)

  // ---------- animation loop ----------
  startAnimation() {
    if (this._rafId != null) return;
    this._lastFrameTime = performance.now();
    this._rafId = requestAnimationFrame(this._tick);
  }
  stopAnimation() {
    if (this._rafId == null) return;
    cancelAnimationFrame(this._rafId);
    this._rafId = null;
  }
  _tick(now) {
    this._rafId = requestAnimationFrame(this._tick);
    const dt = Math.min(0.1, (now - this._lastFrameTime) / 1000);
    this._lastFrameTime = now;

    // Update rotations
    for (let i = 0; i < this._rotRates.length; i++) {
      if (this._rotRates[i] !== 0) this._rotations[i] += this._rotRates[i] * dt;
    }
    // Update clouds: top up to target count, expire old samples. Trigger
    // either by game-mode (Impossible unrevealed) OR sandbox-mode toggle.
    const cloudsActive = this.round && (
      (this._sampled && !this.revealed) ||
      (this._sandboxMode && this._cloudsVisible)
    );
    if (cloudsActive) {
      for (let i = 0; i < this.round.points.length; i++) {
        const p = this.round.points[i];
        const arr = this._cloud[i];
        // remove expired
        for (let j = arr.length - 1; j >= 0; j--) {
          if (now - arr[j].t0 > arr[j].life) arr.splice(j, 1);
        }
        // top up
        while (arr.length < CLOUD_PER_POINT) {
          arr.push({
            // dy is drawn from a unit normal scaled by p.err
            dy: gaussianSample() * p.err,
            t0: now - Math.random() * CLOUD_LIFETIME * 0.5,
            life: CLOUD_LIFETIME * (0.6 + Math.random() * 0.8),
          });
        }
      }
    }
    this.render();
  }
}

// ---------- color helpers ----------
function parseColor(c) {
  // Accepts #rgb, #rrggbb, or rgb()/rgba(). Returns [r,g,b,a] (a in [0,1]).
  c = c.trim();
  if (c.startsWith('#')) {
    let hex = c.slice(1);
    if (hex.length === 3) hex = hex.split('').map(ch => ch + ch).join('');
    const num = parseInt(hex, 16);
    return [(num >> 16) & 255, (num >> 8) & 255, num & 255, 1];
  }
  const m = c.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(',').map(s => parseFloat(s));
    return [parts[0]|0, parts[1]|0, parts[2]|0, parts[3] != null ? parts[3] : 1];
  }
  return [0, 0, 0, 1];
}
function lerpColor(a, b, t) {
  const A = parseColor(a), B = parseColor(b);
  const r = Math.round(A[0] + (B[0] - A[0]) * t);
  const g = Math.round(A[1] + (B[1] - A[1]) * t);
  const bl = Math.round(A[2] + (B[2] - A[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}
function gaussianSample() {
  const u = Math.random() || 1e-12;
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function roundedRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y,     x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x,     y + h, r);
  ctx.arcTo(x,     y + h, x,     y,     r);
  ctx.arcTo(x,     y,     x + w, y,     r);
  ctx.closePath();
}
