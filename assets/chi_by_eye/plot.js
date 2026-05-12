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
const PAD_FULL    = { l: 64, r: 24, t: 32, b: 56 };
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
    this._resize();
  }

  destroy() {
    this.stopAnimation();
    window.removeEventListener('resize', this._onResize);
  }

  setRound(round, opts = {}) {
    this.round = round;
    this.revealed = false;
    this._userSigma = null;
    // Rotation rates per point — random for Hard, zero otherwise.
    this._rotRates = round.points.map(() =>
      opts.rotate ? (Math.random() * 2 - 1) * 1.6 : 0
    );
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
  // Pixels-per-unit y at given y position (for converting errorbar size).
  _dyToPxAt(yWorld, errWorld, R) {
    const r = this.round;
    if (r.logY) {
      // err is in log10 space (stats sampled in log space for log-y rounds)
      const a = Math.log10(r.yMin), b = Math.log10(r.yMax);
      // upper & lower edges in linear y
      const yUp = Math.pow(10, Math.log10(yWorld) + errWorld);
      const yDn = Math.pow(10, Math.log10(yWorld) - errWorld);
      return {
        upPx: this._yToPx(yUp, R),
        dnPx: this._yToPx(yDn, R),
      };
    }
    return {
      upPx: this._yToPx(yWorld + errWorld, R),
      dnPx: this._yToPx(yWorld - errWorld, R),
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
    this._drawCurve(R);
    this._drawData(R);
    this._drawInfoText(R);
  }

  _drawAxes(R) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const S = this._style;
    ctx.strokeStyle = S.axis;
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    // X axis
    ctx.moveTo(R.x0, R.y1);
    ctx.lineTo(R.x1, R.y1);
    // Y axis
    ctx.moveTo(R.x0, R.y0);
    ctx.lineTo(R.x0, R.y1);
    ctx.stroke();

    // Ticks
    const tickLen = 5 * dpr;
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
      const fontPx = 13 * dpr;
      ctx.fillStyle = S.muted;
      ctx.font = `${fontPx}px -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(this.round.labels.x, (R.x0 + R.x1) / 2, R.y1 + 24 * dpr);
      ctx.save();
      ctx.translate(R.x0 - 44 * dpr, (R.y0 + R.y1) / 2);
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

      // Compute chi² contribution if revealed
      let contrib = null;
      let pointColor = S.point;
      if (this.revealed) {
        let resid;
        if (r.logY) resid = Math.log10(p.yObs) - Math.log10(p.yTrue);
        else        resid = p.yObs - p.yTrue;
        contrib = (resid / p.err) ** 2;
        pointColor = this._chi2ContribColor(contrib);
      }

      if (this._sampled && !this.revealed) {
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
    }

    if (this._sampled && !this.revealed) this._drawClouds(R);
  }

  _drawVerticalErrorbar(px, py, p, R, color) {
    const ctx = this.ctx;
    const dpr = this._dpr;
    const { upPx, dnPx } = this._dyToPxAt(p.yObs, p.err, R);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(px, upPx);
    ctx.lineTo(px, dnPx);
    // caps
    const cap = 5 * dpr;
    ctx.moveTo(px - cap, upPx); ctx.lineTo(px + cap, upPx);
    ctx.moveTo(px - cap, dnPx); ctx.lineTo(px + cap, dnPx);
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
        let yy;
        if (r.logY) {
          yy = Math.pow(10, Math.log10(p.yObs) + s.dy);
        } else {
          yy = p.yObs + s.dy;
        }
        const py = this._yToPx(yy, R);
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(px, py, 3 * dpr, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  _drawInfoText(R) {
    if (this.compact) return; // mini-plots: skip header info
    const ctx = this.ctx;
    const dpr = this._dpr;
    const r = this.round;
    ctx.fillStyle = this._style.info;
    ctx.font = `${12 * dpr}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const txt = `N = ${r.N}    k = ${r.k}    dof = ${r.dof}${r.logY ? '    log y' : ''}`;
    ctx.fillText(txt, R.x0 + 6 * dpr, R.y0 - 22 * dpr);
  }

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
    // Update clouds: top up to target count, expire old samples
    if (this._sampled && this.round && !this.revealed) {
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
