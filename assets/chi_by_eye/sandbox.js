// Chi By Eye - sandbox mode.
//
// A free-form playground: no rounds, no scoring. The player builds up a
// data set point-by-point on top of a random model curve and watches the
// chi² readouts update live. Points and error bars are draggable to give
// a direct, tactile feel for how the stats respond.
//
// This module is intentionally light — it owns:
//   * the sandbox state object (model, points, display flags, dof)
//   * helpers for adding / clearing points and refitting the y-range
//   * the chi² → χ²/dof → p → σ pipeline (using stats.js)
// It does NOT touch the DOM or the Plot directly — main.js does that, and
// calls into here whenever the state changes.

import { makeCurve } from './round.js';
import { sigmaToChi2, chi2ToSigma, chi2SF } from './stats.js';

// Standard normal random — Box–Muller.
function randn() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Default starting point count when the model is (re)generated.
export const SANDBOX_INITIAL_POINTS = 0;
// How far apart sequential added points are spaced in x (when adding
// without dragging).
const X_STEP = 0.075;
// Random error-bar size for a newly added point — a fraction of the curve's
// y-span. Drawn uniformly in [ERR_MIN, ERR_MAX] of the span.
const ERR_MIN = 0.05;
const ERR_MAX = 0.18;

// Build a fresh sandbox state with a freshly generated model.
export function makeSandbox(opts = {}) {
  const logY = !!opts.logY;
  const { f, yMin, yMax } = makeCurve(logY);
  return {
    f,
    curveYMin: yMin,
    curveYMax: yMax,
    points: [],          // [{ x, yObs, yTrue, err }]
    logY,
    showBars:   true,    // error-bar visuals
    showClouds: false,   // sampled-cloud visuals (like Impossible)
    dof: 5,              // user-controlled, independent of N
  };
}

// Regenerate just the model curve, preserving display flags & dof. Points
// are cleared because their x positions and statistics are tied to f.
export function regenerateModel(state) {
  const { f, yMin, yMax } = makeCurve(state.logY);
  state.f = f;
  state.curveYMin = yMin;
  state.curveYMax = yMax;
  state.points = [];
}

// Toggle log y. We have to regenerate the curve so it's guaranteed
// strictly positive (or not), and clear points for the same reason.
export function setLogY(state, logY) {
  if (state.logY === logY) return;
  state.logY = logY;
  regenerateModel(state);
}

// Pick a random error-bar half-width for a new point. Linear on linear-y
// axes (fraction of the curve's y-span); linear but scaled to y_true on
// log-y axes so the bars look sensibly sized across decades.
function randomErr(state, yTrue) {
  const frac = ERR_MIN + Math.random() * (ERR_MAX - ERR_MIN);
  if (state.logY) return frac * Math.max(1e-9, yTrue);
  return frac * (state.curveYMax - state.curveYMin);
}

// Drop a new point at an explicit (x, y). Used by the click-to-add
// interaction in the sandbox view: the user picks where the point lands,
// and a random error bar is generated. err is clamped to a sensible
// fraction of the y-range so the user can't end up with vanishingly small
// or absurdly large bars on the first click.
export function addPointAt(state, x, y) {
  const xClamped = Math.max(0, Math.min(1, x));
  const yTrue = state.f(xClamped);
  const err = randomErr(state, yTrue);
  state.points.push({ x: xClamped, yObs: y, yTrue, err });
}

// (Retained for parity with the original spec — programmatic point add
// that places x next-to-right and samples yObs honestly from N(yTrue, err).
// Not currently bound to a button, but kept in case it's wanted later.)
export function addPoint(state) {
  const lastX = state.points.length
    ? state.points[state.points.length - 1].x
    : 0.05 - X_STEP;
  const x = Math.min(0.98, lastX + X_STEP);
  const yTrue = state.f(x);
  const err = randomErr(state, yTrue);
  const yObs = yTrue + err * randn();
  state.points.push({ x, yObs, yTrue, err });
}

// Remove the rightmost point. No-op if empty.
export function removeLastPoint(state) {
  state.points.pop();
}

export function clearPoints(state) {
  state.points = [];
}

// Recompute yTrue for every point. Used after the user drags a point's x
// coordinate (yTrue depends on x via f, but err and yObs are user-owned).
export function refreshYTrue(state) {
  for (const p of state.points) p.yTrue = state.f(p.x);
}

// Compute the chi² statistics for the current state. dof is taken from
// state.dof (not N-k); this matches the sandbox-mode contract that dof is
// a free knob. Returns nulls when there are no points or dof < 1.
export function computeStats(state) {
  const N = state.points.length;
  const dof = Math.max(1, state.dof | 0);
  if (N === 0) {
    return { N, dof, chi2: 0, redChi2: 0, pValue: 1, sigma: 0 };
  }
  let chi2 = 0;
  for (const p of state.points) {
    const residual = p.yObs - p.yTrue;
    chi2 += (residual / p.err) ** 2;
  }
  const redChi2 = chi2 / dof;
  // p = upper-tail probability of chi² with `dof` degrees of freedom
  // (numerically stable form for large chi²).
  const pValue = Math.max(Math.min(chi2SF(chi2, dof), 1), 0);
  const sigma  = chi2ToSigma(chi2, dof);
  return { N, dof, chi2, redChi2, pValue, sigma };
}

// Compute the y-range to use for plotting. Tight by design: the data
// should fill the plot, and adding a point near the edge should adjust
// the axes only modestly.
//
// ERR_VIS = 1 means we reserve room for one σ above and below each
// point — i.e. exactly enough to fit the error bar itself. The previous
// 3σ buffer caused the axes to jump noticeably whenever a high or low
// point was added. PAD_TOP / PAD_BOTTOM then add a thin breathing strip
// (top is a bit larger to clear the N= HUD label).
export function computeDisplayYRange(state) {
  const ERR_VIS    = 1;
  const PAD_BOTTOM = 0.03;
  const PAD_TOP    = 0.07;
  if (state.logY) {
    let lo = Math.log10(state.curveYMin);
    let hi = Math.log10(state.curveYMax);
    for (const p of state.points) {
      const up = p.yObs + ERR_VIS * p.err;
      const dn = p.yObs - ERR_VIS * p.err;
      hi = Math.max(hi, Math.log10(Math.max(1e-12, up)));
      const dnFloor = dn > 0 ? Math.log10(dn)
                              : Math.log10(Math.max(1e-12, p.yObs)) - 0.6;
      lo = Math.min(lo, dnFloor);
    }
    const span = hi - lo;
    return {
      yMin: Math.pow(10, lo - PAD_BOTTOM * span),
      yMax: Math.pow(10, hi + PAD_TOP    * span),
    };
  }
  let lo = state.curveYMin;
  let hi = state.curveYMax;
  for (const p of state.points) {
    lo = Math.min(lo, p.yObs - ERR_VIS * p.err);
    hi = Math.max(hi, p.yObs + ERR_VIS * p.err);
  }
  const span = hi - lo;
  return {
    yMin: lo - PAD_BOTTOM * span,
    yMax: hi + PAD_TOP    * span,
  };
}

// Build a `round`-shaped object that Plot can render. We hand back the
// SAME points array (not a copy), so mutations from drag handlers are
// reflected here immediately without another setRound call.
export function asRound(state) {
  const { yMin, yMax } = computeDisplayYRange(state);
  return {
    f: state.f,
    points: state.points,
    N: state.points.length,
    k: 0,                       // not used by the renderer
    dof: state.dof,
    logY: state.logY,
    yMin, yMax,
    curveYMin: state.curveYMin,
    curveYMax: state.curveYMax,
    labels: { x: 'x', y: 'y' },
    difficulty: 'sandbox',
  };
}
