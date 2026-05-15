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

import { chi2ToSigma, sigmaToChi2 } from './stats.js';

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
    // log-normal spread of per-point error bar size (0 = uniform per round).
    errSizeSpread: 0,
  },
  intermediate: {
    name: 'Intermediate',
    nMin: 7,
    nMax: 12,
    scoreMultiplier: 1.4,
    logYProb: 0.0,
    perPointRotation: false,
    sampledErrorbars: false,
    errSizeSpread: 0.25,
  },
  challenging: {
    name: 'Challenging',
    nMin: 8,
    nMax: 12,
    scoreMultiplier: 2.0,
    logYProb: 0.5,
    perPointRotation: false,
    sampledErrorbars: false,
    errSizeSpread: 0.35,
  },
  hard: {
    name: 'Hard',
    nMin: 12,
    nMax: 20,
    scoreMultiplier: 3.0,
    logYProb: 0.5,
    perPointRotation: true,
    sampledErrorbars: false,
    errSizeSpread: 0.45,
  },
  impossible: {
    name: 'Impossible',
    nMin: 12,
    nMax: 20,
    scoreMultiplier: 5.0,
    logYProb: 0.5,
    perPointRotation: false,
    sampledErrorbars: true,
    errSizeSpread: 0.45,
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
export function makeCurve(logY) {
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

  // Noise and error bars are ALWAYS in linear y units. For log-y rounds we
  // scale each point's σ as a fraction of y_true so the bars stay sensibly
  // sized across orders of magnitude. Because both σ_true and σ_stated scale
  // together, the chi² distribution depends only on errFactor — independent
  // of the per-point variation introduced by errSizeSpread.
  //
  //   linear y:  σ_true_i = sigmaTrueFrac * ySpan        * sizeFactor_i
  //   log    y:  σ_true_i = sigmaTrueFrac * y_true_i     * sizeFactor_i
  //              (i.e. for log y, sigmaTrueFrac is a fractional uncertainty)
  let sigmaTrueFrac;
  if (logY) {
    // For log y this is a fractional uncertainty (per point: σ_i = frac * y_i).
    // We want it large enough that the asymmetric appearance on the log axis
    // is visible (a 20–40% fractional error gives ~25–70% asymmetry between
    // the upper and lower bar lengths in log space).
    sigmaTrueFrac = rand(0.05, 0.18);
  } else {
    sigmaTrueFrac = rand(0.035, 0.13);
  }
  const ySpan = logY ? Math.log10(yMax / yMin) : (yMax - yMin);

  // Sample the round's target true sigma so the full slider range gets used,
  // with a gentle bias toward the low end where intuition is hardest to
  // develop (the "fit looks fine but is it suspiciously fine?" zone). Use a
  // power-law transformation of a uniform variate: target = MIN + range·u^p.
  // p > 1 squashes mass toward the low end; p = 1.3 gives a moderate skew
  // without sacrificing the high end.
  //
  // The deterministic target → errFactor mapping then sets the *expected*
  // chi²:   E[chi²] = N / errFactor², so errFactor = sqrt(N / target_chi²).
  // Realized chi² scatters around the target due to chi²-distribution
  // noise, which smooths the histogram.
  //
  // SIGMA_SAMPLE_MAX is slightly above the slider's max so a small fraction
  // of rounds land off-scale, giving the player occasional very-high-tension
  // rounds.
  const SIGMA_SAMPLE_MIN = 0.05;
  const SIGMA_SAMPLE_MAX = 5.3;
  const SIGMA_SKEW = 1.3;
  const u = Math.random();
  const targetSigma = SIGMA_SAMPLE_MIN +
    (SIGMA_SAMPLE_MAX - SIGMA_SAMPLE_MIN) * Math.pow(u, SIGMA_SKEW);
  const targetChi2 = Math.max(0.5, sigmaToChi2(targetSigma, dof));
  // Clamp errFactor to a range that keeps the visual errorbar size sensible.
  const errFactor = Math.max(0.3, Math.min(3.0, Math.sqrt(N / targetChi2)));

  const points = [];
  const xPad = 0.04;
  const spread = D.errSizeSpread || 0;
  for (let i = 0; i < N; i++) {
    const x = xPad + (1 - 2 * xPad) * ((i + 0.5 + 0.4 * (Math.random() - 0.5)) / N);
    const sizeFactor = spread > 0 ? Math.exp(spread * gaussian()) : 1;
    const yTrue = f(x);
    const sigmaScale = logY ? yTrue : ySpan;
    const sigmaTrue_i = sigmaTrueFrac * sigmaScale * sizeFactor;
    const err = errFactor * sigmaTrue_i;
    let yObs = yTrue + sigmaTrue_i * gaussian();
    // For log y, if the realized noise puts yObs <= 0 (rare), regenerate.
    if (logY) {
      let attempts = 0;
      while (yObs <= 0 && attempts < 8) {
        yObs = yTrue + sigmaTrue_i * gaussian();
        attempts++;
      }
      if (yObs <= 0) yObs = yTrue * 0.05; // hard fallback
    }
    points.push({ x, yTrue, yObs, err, rotRate: 0 });
  }

  // chi² is always in linear residual / linear err — same convention regardless
  // of whether the axis is linear or log. (Linear-space residuals are what a
  // detector reports; the axis is just a display choice.)
  let chi2 = 0;
  for (const p of points) {
    const residual = p.yObs - p.yTrue;
    chi2 += (residual / p.err) ** 2;
  }
  const trueSigma = chi2ToSigma(chi2, dof);

  const labels = makeLabels();

  // Expand the displayed y-range so the curve, all data points, and their
  // ±3σ error bars / cloud samples all fit. Bottom gets 10% margin; top gets
  // a larger margin (22%) to reserve clear airspace behind the N/k/dof HUD
  // in the top-left of the plot. This is purely a display tweak — chi², σ,
  // and every other stat are computed from yObs / yTrue / err, which are
  // unaffected by the rendered axis range.
  let dispYMin, dispYMax;
  const ERR_VIS = 3;
  const PAD_BOTTOM = 0.10;
  const PAD_TOP    = 0.22;
  if (logY) {
    // Work in log space so the margin is symmetric on the axis.
    let logLo = Math.log10(yMin);
    let logHi = Math.log10(yMax);
    for (const p of points) {
      const up = p.yObs + ERR_VIS * p.err;
      const dn = p.yObs - ERR_VIS * p.err;
      logHi = Math.max(logHi, Math.log10(Math.max(1e-12, up)));
      // If dn <= 0 the error bar extends below 0; allow the axis to go a bit
      // below the smallest positive y we'd otherwise need.
      const dnFloor = dn > 0 ? Math.log10(dn)
                              : Math.log10(p.yObs) - 0.6; // ~0.4× yObs floor
      logLo = Math.min(logLo, dnFloor);
    }
    const span = logHi - logLo;
    dispYMin = Math.pow(10, logLo - PAD_BOTTOM * span);
    dispYMax = Math.pow(10, logHi + PAD_TOP    * span);
  } else {
    let lo = yMin, hi = yMax;
    for (const p of points) {
      lo = Math.min(lo, p.yObs - ERR_VIS * p.err);
      hi = Math.max(hi, p.yObs + ERR_VIS * p.err);
    }
    const span = hi - lo;
    dispYMin = lo - PAD_BOTTOM * span;
    dispYMax = hi + PAD_TOP    * span;
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
    // Bookkeeping (per-round scalar) — useful for debug / future analytics.
    sigmaTrueFrac,
    errFactor,
    chi2,
    redChi2: chi2 / dof,
    trueSigma,
    labels,
    difficulty: difficultyKey,
  };
}
