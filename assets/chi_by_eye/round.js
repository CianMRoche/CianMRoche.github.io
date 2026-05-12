// Round generation for Chi By Eye.
//
// Each round produces:
//   - a true model curve f(x) over a normalized x range [0, 1]
//   - N noisy data points along x, each with a (potentially mis-stated)
//     error bar
//   - a randomly chosen fake k (model parameter count) used only to set
//     dof = N - k
//   - random independent / dependent variable names for the axes
//   - the true chi^2 of the data against the model under the stated errors
//
// The user-facing answer is the two-sided sigma equivalent of that chi^2
// for that dof, computed in stats.js.

import { chi2ToSigma } from './stats.js';

// ---------- difficulty configuration ----------
export const DIFFICULTIES = {
  easy: {
    name: 'Easy',
    nMin: 5,
    nMax: 8,
    scoreMultiplier: 1.0,
    logYProb: 0.0,
    perPointRotation: false,
    sampledErrorbars: false,
  },
  intermediate: {
    name: 'Intermediate',
    nMin: 7,
    nMax: 12,
    scoreMultiplier: 1.4,
    logYProb: 0.0,
    perPointRotation: false,
    sampledErrorbars: false,
  },
  challenging: {
    name: 'Challenging',
    nMin: 8,
    nMax: 12,
    scoreMultiplier: 2.0,
    logYProb: 0.5,
    perPointRotation: false,
    sampledErrorbars: false,
  },
  hard: {
    name: 'Hard',
    nMin: 12,
    nMax: 20,
    scoreMultiplier: 3.0,
    logYProb: 0.5,
    perPointRotation: true,
    sampledErrorbars: false,
  },
  impossible: {
    name: 'Impossible',
    nMin: 12,
    nMax: 20,
    scoreMultiplier: 5.0,
    logYProb: 0.5,
    perPointRotation: false,
    sampledErrorbars: true,
  },
};

// ---------- random helpers ----------
function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randSign() { return Math.random() < 0.5 ? -1 : 1; }
function gaussian() {
  // Box-Muller
  const u = Math.random() || 1e-12;
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ---------- curve primitives ----------
// All functions take normalized x in [0, 1] and produce y in some range.
const CURVE_TYPES = [
  'linear', 'quad', 'cubic', 'sin', 'expDecay', 'expRise',
  'powerLaw', 'damped', 'logistic', 'gaussian',
];

function makeRawCurve() {
  const type = choice(CURVE_TYPES);
  switch (type) {
    case 'linear': {
      const a = rand(0.1, 1), b = rand(-1, 1);
      return x => a + b * x;
    }
    case 'quad': {
      const a = rand(0.1, 1), b = rand(-1.5, 1.5), c = rand(-2, 2);
      return x => a + b * x + c * x * x;
    }
    case 'cubic': {
      const a = rand(0.1, 1), b = rand(-1, 1), c = rand(-2, 2), d = rand(-2, 2);
      return x => a + b * x + c * x * x + d * x * x * x;
    }
    case 'sin': {
      const a = rand(0.2, 1);
      const b = rand(0.3, 1) * randSign();
      const c = rand(1, 4) * Math.PI;
      const d = rand(0, 2 * Math.PI);
      return x => a + b * Math.sin(c * x + d);
    }
    case 'expDecay': {
      const a = rand(0.05, 0.3), b = rand(0.5, 1.5), c = rand(1.5, 5);
      return x => a + b * Math.exp(-c * x);
    }
    case 'expRise': {
      const a = rand(0.05, 0.5), b = rand(0.3, 1), c = rand(1, 3);
      const denom = Math.exp(c) - 1;
      return x => a + b * (Math.exp(c * x) - 1) / denom;
    }
    case 'powerLaw': {
      const a = rand(0.1, 0.5);
      const b = rand(0.3, 1);
      const p = rand(0.3, 2.5) * randSign();
      return x => a + b * Math.pow(Math.max(x, 0.01), p);
    }
    case 'damped': {
      const a = rand(0.3, 0.8);
      const b = rand(0.3, 0.8);
      const c = rand(1, 3);
      const w = rand(3, 7) * Math.PI;
      const phi = rand(0, 2 * Math.PI);
      return x => a + b * Math.exp(-c * x) * Math.sin(w * x + phi);
    }
    case 'logistic': {
      const a = rand(0.1, 0.3);
      const b = rand(0.5, 1);
      const c = rand(5, 14);
      const d = rand(0.25, 0.75);
      return x => a + b / (1 + Math.exp(-c * (x - d)));
    }
    case 'gaussian': {
      const a = rand(0.1, 0.4);
      const b = rand(0.4, 1);
      const mu = rand(0.2, 0.8);
      const sigma = rand(0.08, 0.25);
      return x => a + b * Math.exp(-0.5 * ((x - mu) / sigma) ** 2);
    }
  }
}

// Returns a curve f and its observed yMin/yMax over [0,1] sampled finely.
function makeCurve(logY) {
  // Try a few until we get something with reasonable range and (if logY)
  // strictly positive values after shifting.
  for (let attempt = 0; attempt < 20; attempt++) {
    let f = makeRawCurve();
    let yMin = Infinity, yMax = -Infinity;
    for (let i = 0; i <= 400; i++) {
      const y = f(i / 400);
      if (!isFinite(y)) { yMin = NaN; break; }
      if (y < yMin) yMin = y;
      if (y > yMax) yMax = y;
    }
    if (!isFinite(yMin) || !isFinite(yMax)) continue;
    const span = yMax - yMin;
    if (span < 0.05) continue; // too flat
    if (span > 50) continue;   // pathological

    if (logY) {
      // Ensure positive. Shift so that yMin is at least 10% of span above zero.
      let shift = 0;
      if (yMin < 0.1 * span) shift = 0.1 * span - yMin;
      const f0 = f;
      f = x => f0(x) + shift;
      yMin += shift;
      yMax += shift;
      // Log range should span at least ~0.3 decades to be interesting
      if (yMax / yMin < 1.3) continue;
    }
    return { f, yMin, yMax };
  }
  // Fallback: simple line
  return { f: x => 0.3 + 0.4 * x, yMin: 0.3, yMax: 0.7 };
}

// ---------- axis labels ----------
const NOUNS = [
  'cat', 'galaxy', 'painting', 'ferret', 'bicycle', 'pulsar', 'sandwich',
  'photon', 'hamster', 'asteroid', 'tortoise', 'opossum', 'neutrino',
  'kettle', 'tarantula', 'manuscript', 'comet', 'parsnip', 'mongoose',
  'jellyfish', 'monolith', 'quasar', 'oyster', 'helmet', 'narwhal',
];
const FEATURES = [
  'length', 'mass', 'brightness', 'stiffness', 'redshift', 'opacity',
  'velocity', 'temperature', 'angular size', 'viscosity', 'hue',
  'enthusiasm', 'spin', 'flux', 'density', 'reluctance', 'amplitude',
  'crookedness', 'fluffiness', 'rotation rate', 'count', 'salinity',
];
const X_MEASURABLES = [
  'time', 'temperature', 'pressure', 'distance', 'altitude', 'voltage',
  'frequency', 'pH', 'humidity', 'magnetic field', 'tilt angle',
  'sound intensity', 'wavelength', 'age', 'concentration', 'phase',
];
const X_CONTEXTS = [
  '', '', '', // bias toward bare measurable
  ' in air', ' since impact', ' above sea level', ' at the equator',
  ' on Tuesday', ' in a vacuum', ' under load',
];

function makeLabels() {
  return {
    y: `${choice(NOUNS)} ${choice(FEATURES)}`,
    x: `${choice(X_MEASURABLES)}${choice(X_CONTEXTS)}`,
  };
}

// ---------- main entry: build a round ----------
export function makeRound(difficultyKey) {
  const D = DIFFICULTIES[difficultyKey];
  const logY = Math.random() < D.logYProb;
  const { f, yMin, yMax } = makeCurve(logY);

  const N = randInt(D.nMin, D.nMax);

  // Fake number of model parameters. We want dof = N - k >= 1, and we
  // want k to look plausible — typically 1..4 for these toy models.
  const kMax = Math.max(1, Math.min(5, N - 1));
  const k = randInt(1, kMax);
  const dof = N - k;

  // True noise sigma, set as a fraction of y range so points are visible.
  // For log axes, "range" is in log space and noise is multiplicative; we
  // model that as additive in log10 then exponentiated when sampling.
  // sigmaTrueFrac sets the overall visual scale of the noise (and therefore
  // the error bars, since err = errFactor * sigmaTrue). It does NOT affect
  // the chi^2 statistics — those only depend on errFactor.
  const ySpan = logY ? Math.log10(yMax / yMin) : (yMax - yMin);
  const sigmaTrueFrac = rand(0.035, 0.13);
  const sigmaTrue = sigmaTrueFrac * ySpan;

  // Error bar relative to true sigma. Log-uniform in [0.45, 2.4] so we
  // get a mix of "fits too well" and "obviously bad fit" rounds.
  const errFactor = Math.exp(rand(Math.log(0.45), Math.log(2.4)));
  const sigmaStated = errFactor * sigmaTrue;

  // Sample points along x.
  const points = [];
  // Slightly inset x so points don't sit on the axis edges.
  const xPad = 0.04;
  for (let i = 0; i < N; i++) {
    // Quasi-uniform with small jitter
    const x = xPad + (1 - 2 * xPad) * ((i + 0.5 + 0.4 * (Math.random() - 0.5)) / N);
    let yTrue, yObs;
    if (logY) {
      const yt = f(x);
      yTrue = yt;
      // additive log-space noise
      const logY0 = Math.log10(yt);
      const logYObs = logY0 + sigmaTrue * gaussian();
      yObs = Math.pow(10, logYObs);
    } else {
      yTrue = f(x);
      yObs = yTrue + sigmaTrue * gaussian();
    }
    // Per-point error bar size (same across points for now — plan says
    // "easy: all error bars same size", and we don't deviate from that
    // at higher difficulties because rotation / sampling is what makes
    // them harder).
    const err = sigmaStated;
    // Hard mode: random rotation rate (radians/sec); 0 for other modes.
    const rotRate = 0; // assigned by the renderer per difficulty in main
    points.push({ x, yTrue, yObs, err, rotRate });
  }

  // Compute true chi^2 (in linear space for linear y, in log10 space for
  // log y — same space the noise was generated in).
  let chi2 = 0;
  for (const p of points) {
    let residual;
    if (logY) {
      residual = Math.log10(p.yObs) - Math.log10(p.yTrue);
    } else {
      residual = p.yObs - p.yTrue;
    }
    chi2 += (residual / p.err) ** 2;
  }
  const trueSigma = chi2ToSigma(chi2, dof);

  const labels = makeLabels();

  // Expand the displayed y-range so the curve, all data points, and their
  // ±3σ error bars / cloud samples all fit, with a 10% margin on each side
  // so nothing presses against the axis lines.
  let dispYMin, dispYMax;
  const ERR_VIS = 3; // headroom in units of stated errorbar
  if (logY) {
    let lo = Math.log10(yMin), hi = Math.log10(yMax);
    for (const p of points) {
      const ly = Math.log10(p.yObs);
      lo = Math.min(lo, ly - ERR_VIS * p.err);
      hi = Math.max(hi, ly + ERR_VIS * p.err);
    }
    const pad = 0.1 * (hi - lo);
    dispYMin = Math.pow(10, lo - pad);
    dispYMax = Math.pow(10, hi + pad);
  } else {
    let lo = yMin, hi = yMax;
    for (const p of points) {
      lo = Math.min(lo, p.yObs - ERR_VIS * p.err);
      hi = Math.max(hi, p.yObs + ERR_VIS * p.err);
    }
    const pad = 0.1 * (hi - lo);
    dispYMin = lo - pad;
    dispYMax = hi + pad;
  }

  return {
    f,
    points,
    N,
    k,
    dof,
    logY,
    // Keep curveYMin/curveYMax for any analytics; expose dispYMin/dispYMax
    // as yMin/yMax for plot rendering.
    curveYMin: yMin,
    curveYMax: yMax,
    yMin: dispYMin,
    yMax: dispYMax,
    sigmaTrue,
    sigmaStated,
    chi2,
    redChi2: chi2 / dof,
    trueSigma,
    labels,
    difficulty: difficultyKey,
  };
}
