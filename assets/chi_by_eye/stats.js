// Statistics utilities for Chi By Eye.
//
// Implements:
//   - ln(Gamma)                          via Lanczos approximation
//   - regularized lower/upper incomplete gamma functions
//   - chi^2 CDF and survival function
//   - inverse normal CDF                 via Acklam's rational approximation
//   - chi^2 -> one-sided sigma equivalent
//   - sigma -> chi^2 (for live slider readout) via Newton iterations
//
// Conventions:
//   The "sigma equivalent" used here is the astro/PDG two-sided convention:
//       p_upper = Q_{chi^2}(chi^2, dof)        (chi^2 upper tail prob)
//       sigma   = sqrt(2) * erfcinv(p_upper)
//             = -Phi^{-1}(p_upper / 2)
//   so that P(|Z| > sigma) = p_upper for Z ~ N(0,1).
//   Reference points:  p=0.317 -> 1.0 sigma,  p=0.05 -> 1.96 sigma,
//                      p=0.0027 -> 3.0 sigma,  p=5.7e-7 -> 5.0 sigma.

// ---------- ln Gamma (Lanczos g=7, n=9) ----------
const LANCZOS_G = 7;
const LANCZOS_P = [
  0.99999999999980993,
  676.5203681218851,
  -1259.1392167224028,
  771.32342877765313,
  -176.61502916214059,
  12.507343278686905,
  -0.13857109526572012,
  9.9843695780195716e-6,
  1.5056327351493116e-7,
];

export function lnGamma(x) {
  if (x < 0.5) {
    // reflection formula
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  x -= 1;
  let a = LANCZOS_P[0];
  const t = x + LANCZOS_G + 0.5;
  for (let i = 1; i < LANCZOS_P.length; i++) {
    a += LANCZOS_P[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// ---------- regularized incomplete gamma ----------
// Numerical Recipes style: series for x < a+1, continued fraction for x >= a+1.
const ITMAX = 200;
const EPS = 1e-14;
const FPMIN = 1e-300;

function gser(a, x) {
  // series for P(a,x), x < a+1
  if (x <= 0) return 0;
  let ap = a;
  let sum = 1 / a;
  let del = sum;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) {
      return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
    }
  }
  // didn't converge — return best guess
  return sum * Math.exp(-x + a * Math.log(x) - lnGamma(a));
}

function gcf(a, x) {
  // continued fraction for Q(a,x), x >= a+1
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - lnGamma(a)) * h;
}

export function gammaP(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  if (x < a + 1) return gser(a, x);
  return 1 - gcf(a, x);
}

export function gammaQ(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  if (x < a + 1) return 1 - gser(a, x);
  return gcf(a, x);
}

// ---------- chi^2 CDF and survival ----------
export function chi2CDF(chi2, dof) {
  return gammaP(dof / 2, chi2 / 2);
}

export function chi2SF(chi2, dof) {
  return gammaQ(dof / 2, chi2 / 2);
}

// PDF of chi^2 distribution. Used by Newton iteration.
export function chi2PDF(chi2, dof) {
  if (chi2 <= 0) return 0;
  const k = dof / 2;
  // f(x) = x^(k-1) * exp(-x/2) / (2^k * Gamma(k))
  // log f = (k-1)*log(x) - x/2 - k*log(2) - lnGamma(k)
  const logf = (k - 1) * Math.log(chi2) - chi2 / 2 - k * Math.log(2) - lnGamma(k);
  return Math.exp(logf);
}

// ---------- inverse normal CDF (Acklam) ----------
// Returns z such that Phi(z) = p. Accurate to ~1.15e-9 in absolute error.
const ACKL_A = [
  -3.969683028665376e+01,
   2.209460984245205e+02,
  -2.759285104469687e+02,
   1.383577518672690e+02,
  -3.066479806614716e+01,
   2.506628277459239e+00,
];
const ACKL_B = [
  -5.447609879822406e+01,
   1.615858368580409e+02,
  -1.556989798598866e+02,
   6.680131188771972e+01,
  -1.328068155288572e+01,
];
const ACKL_C = [
  -7.784894002430293e-03,
  -3.223964580411365e-01,
  -2.400758277161838e+00,
  -2.549732539343734e+00,
   4.374664141464968e+00,
   2.938163982698783e+00,
];
const ACKL_D = [
   7.784695709041462e-03,
   3.224671290700398e-01,
   2.445134137142996e+00,
   3.754408661907416e+00,
];
const ACKL_PLOW  = 0.02425;
const ACKL_PHIGH = 1 - ACKL_PLOW;

export function invNormCDF(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  let q, r;
  if (p < ACKL_PLOW) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((ACKL_C[0]*q + ACKL_C[1])*q + ACKL_C[2])*q + ACKL_C[3])*q + ACKL_C[4])*q + ACKL_C[5]) /
           ((((ACKL_D[0]*q + ACKL_D[1])*q + ACKL_D[2])*q + ACKL_D[3])*q + 1);
  }
  if (p <= ACKL_PHIGH) {
    q = p - 0.5;
    r = q * q;
    return (((((ACKL_A[0]*r + ACKL_A[1])*r + ACKL_A[2])*r + ACKL_A[3])*r + ACKL_A[4])*r + ACKL_A[5]) * q /
           (((((ACKL_B[0]*r + ACKL_B[1])*r + ACKL_B[2])*r + ACKL_B[3])*r + ACKL_B[4])*r + 1);
  }
  q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((ACKL_C[0]*q + ACKL_C[1])*q + ACKL_C[2])*q + ACKL_C[3])*q + ACKL_C[4])*q + ACKL_C[5]) /
          ((((ACKL_D[0]*q + ACKL_D[1])*q + ACKL_D[2])*q + ACKL_D[3])*q + 1);
}

// Normal CDF via erf
function erf(x) {
  // Abramowitz & Stegun 7.1.26, ~1.5e-7 accuracy
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5*t + a4)*t) + a3)*t + a2)*t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

export function normCDF(x) {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

// ---------- chi^2 <-> sigma equivalent (two-sided convention) ----------
export function chi2ToSigma(chi2, dof) {
  if (chi2 <= 0) return 0;
  const q = chi2SF(chi2, dof);
  if (q >= 1) return 0;
  if (q <= 1e-300) return 37; // numerical floor; ~37 sigma is our practical cap
  return -invNormCDF(q / 2);
}

// Inverse: given a sigma, find chi^2 such that chi2ToSigma(chi^2, dof) = sigma.
// At sigma=0 the corresponding chi^2 is 0 under the two-sided convention
// (since p_upper = 1).
export function sigmaToChi2(sigma, dof) {
  if (sigma <= 0) return 0;
  // Target upper-tail prob: p = 2 * (1 - Phi(sigma))
  const pTarget = 2 * (1 - normCDF(sigma));
  // Wilson-Hilferty initial guess: chi^2 = dof * (1 - 2/(9*dof) + sigma*sqrt(2/(9*dof)))^3
  const wh = 1 - 2 / (9 * dof) + sigma * Math.sqrt(2 / (9 * dof));
  let x = Math.max(1e-6, dof * wh * wh * wh);
  // Newton iterations on F(x) - (1 - p_target) = 0, i.e. on CDF.
  // Equivalently: f(x) = Q(x) - p_target = 0,  f'(x) = -pdf(x)
  for (let i = 0; i < 30; i++) {
    const q = chi2SF(x, dof);
    const f = q - pTarget;
    const pdf = chi2PDF(x, dof);
    if (pdf <= 0 || !isFinite(pdf)) break;
    const dx = f / pdf; // f' = -pdf, but Newton step is -f/f' = f/pdf
    const xNew = x + dx;
    if (!isFinite(xNew) || xNew <= 0) break;
    x = xNew;
    if (Math.abs(dx) < 1e-9 * Math.max(1, x)) break;
  }
  return x;
}
