// Caustica — lens.js
//
// Cosmological distances (flat ΛCDM) and gravitational lens deflection angles.
// All angular quantities in arcseconds. Distances in Mpc.

// ── Cosmology ──────────────────────────────────────────────────────────────
//
// Flat ΛCDM. H0 and Omega_m are user-adjustable at runtime (Omega_L = 1 − Omega_m
// keeps the universe flat); C_LIGHT is fixed. After changing them the caller must
// recompute any cached distances (main.js: invalidateDistances → precomputeDistances).

const C_LIGHT = 2.998e5;   // km/s
let H0      = 70;          // km/s/Mpc
let Omega_m = 0.3;
let Omega_L = 0.7;
let DH      = C_LIGHT / H0;

// Update the cosmology in place (flat ΛCDM). Silently ignores out-of-range inputs.
export function setCosmology({ H0: h, Omega_m: om } = {}) {
  if (isFinite(h)  && h  > 0)              H0      = h;
  if (isFinite(om) && om >= 0 && om <= 1)  Omega_m = om;
  Omega_L = 1 - Omega_m;   // flat
  DH      = C_LIGHT / H0;
}

export function getCosmology() { return { H0, Omega_m, Omega_L }; }

function Ez(z) { return Math.sqrt(Omega_m * (1 + z) ** 3 + Omega_L); }

export function comovingDist(z) {
  if (z <= 0) return 0;
  const n = 200, dz = z / n;
  let s = 0;
  for (let i = 0; i < n; i++) s += 1.0 / Ez((i + 0.5) * dz);
  return DH * s * dz;
}

export function angDiamDist(z) { return comovingDist(z) / (1 + z); }

export function angDiamDistBetween(z1, z2) {
  if (z2 <= z1) return 0;
  return (comovingDist(z2) - comovingDist(z1)) / (1 + z2);
}

// ── Time delays ──────────────────────────────────────────────────────────────
//
// Single-lens-plane time-delay distance D_Δt = (1+z_L)·D_L·D_S/D_LS (Mpc). Scales
// as 1/H0 and depends on Omega_m through the angular-diameter distances, so both
// cosmology sliders move the resulting delays. Returns 0 when the geometry is
// degenerate (source at/behind lens). NOTE: valid for a SINGLE lens plane only;
// genuine multiplane arrival times need the generalized time-delay formula.
export function timeDelayDistance(zL, zS) {
  const DL  = angDiamDist(zL);
  const DS  = angDiamDist(zS);
  const DLS = angDiamDistBetween(zL, zS);
  if (DLS <= 0 || DS <= 0) return 0;
  return (1 + zL) * DL * DS / DLS;
}

// Convert a difference in the reduced Fermat potential (arcsec², as returned by the
// Fermat surface) at a given time-delay distance into a time delay in days.
//   Δt = D_Δt/c · Δφ·(arcsec→rad)²
export function fermatDiffToDays(dtDistMpc, dPhiArcsec2) {
  const ARCSEC2RAD = Math.PI / (180 * 3600);
  const MPC_KM     = 3.0856775815e19;
  const seconds = (dtDistMpc * MPC_KM / C_LIGHT) * dPhiArcsec2 * ARCSEC2RAD * ARCSEC2RAD;
  return seconds / 86400;
}

// ── Lens deflection angles ─────────────────────────────────────────────────

const EPS      = 1e-12;
const SIE_SOFT = 0.001;

export function deflectPointMass(ux, uy, b) {
  const r2 = Math.max(ux*ux + uy*uy, SIE_SOFT * SIE_SOFT);
  return [b * b / r2 * ux, b * b / r2 * uy];
}

export function deflectSIE(ux, uy, b, q, phi) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const xr =  cp * ux + sp * uy;
  const yr = -sp * ux + cp * uy;
  const qs  = Math.max(q, 0.001);
  const sqf = Math.sqrt(Math.max(1 - qs * qs, EPS));
  const s   = SIE_SOFT;
  const r   = Math.sqrt(qs * qs * (xr * xr + s * s) + yr * yr);
  const A   = b * qs / sqf;
  const ax  = A * Math.atan2(sqf * xr, r + s);
  const ay  = A * 0.5 * Math.log((1 + sqf * yr / (r + qs * qs * s)) /
                                  Math.max(1 - sqf * yr / (r + qs * qs * s), EPS));
  return [cp * ax - sp * ay, sp * ax + cp * ay];
}

// NIE — Nonsingular Isothermal Ellipsoid: SIE with a user-specified core radius rc.
export function deflectNIE(ux, uy, b, q, phi, rc) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const xr =  cp * ux + sp * uy;
  const yr = -sp * ux + cp * uy;
  const qs  = Math.max(q, 0.001);
  const sqf = Math.sqrt(Math.max(1 - qs * qs, EPS));
  const s   = Math.max(rc, SIE_SOFT);
  const r   = Math.sqrt(qs * qs * (xr * xr + s * s) + yr * yr);
  const A   = b * qs / sqf;
  const ax  = A * Math.atan2(sqf * xr, r + s);
  const ay  = A * 0.5 * Math.log((1 + sqf * yr / (r + qs * qs * s)) /
                                  Math.max(1 - sqf * yr / (r + qs * qs * s), EPS));
  return [cp * ax - sp * ay, sp * ax + cp * ay];
}

// EPL — exact Elliptical Power Law (Tessore & Metcalf 2015), ported from the
// lenstronomy `epl_numba` reference implementation. Unlike the old scaled-SIE
// approximation this is a true gradient field for all q and gamma (curl-free), so
// its convergence/shear maps are self-consistent and it has a closed-form potential
// (see lensPotential). `gamma` is the 3D density slope (gamma=2 = isothermal = SIE).
//
// Angular part Ω(φ) via the Tessore recurrence: Ω_0 = e^{iφ},
//   Ω_n = Ω_{n-1} · [2n−(2−t)]/[2n+(2−t)] · (−f·e^{2iφ}),  f = (1−q)/(1+q),  t = γ−1.
function _eplOmega(phi, t, q) {
  const f  = (1 - q) / (1 + q);
  const cf = -f * Math.cos(2*phi), sf = -f * Math.sin(2*phi);   // fact = −f·e^{2iφ}
  let omR = Math.cos(phi), omI = Math.sin(phi);                 // Ω_0 = e^{iφ}
  let sumR = 0, sumI = 0;
  for (let n = 1; n <= 200; n++) {
    sumR += omR; sumI += omI;
    const c  = (2*n - (2 - t)) / (2*n + (2 - t));
    const nr = (omR*cf - omI*sf) * c;
    const ni = (omR*sf + omI*cf) * c;
    omR = nr; omI = ni;
    if (omR*omR + omI*omI < 1e-32) break;   // term negligible (double precision)
  }
  sumR += omR; sumI += omI;
  return [sumR, sumI];
}

export function deflectEPL(ux, uy, b, q, phi, gamma) {
  const qs = Math.min(Math.max(q, 0.05), 1.0);   // series converges within 200 terms for q≥0.05
  const t  = gamma - 1;
  const bT = b * qs;                             // b_Tessore = b·q matches Caustica's SIE b at γ=2
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const xr =  cp*ux + sp*uy;                     // rotate into the major-axis frame
  const yr = -sp*ux + cp*uy;
  const R   = Math.max(Math.sqrt(qs*qs*xr*xr + yr*yr), SIE_SOFT);
  const ang = Math.atan2(yr, qs*xr);
  const [omR, omI] = _eplOmega(ang, t, qs);
  const pref = (2*bT)/(1 + qs) * Math.pow(bT/R, t) * (R/bT);
  const axr = pref*omR, ayr = pref*omI;
  return [cp*axr - sp*ayr, sp*axr + cp*ayr];     // rotate deflection back
}

// ── Multiplane ray tracer ──────────────────────────────────────────────────

export function precomputeDistances(planes) {
  const N = planes.length;
  const D_obs  = new Float64Array(N);
  const D_btwn = new Float64Array(N * N);
  for (let i = 0; i < N; i++) {
    D_obs[i] = angDiamDist(planes[i].z);
    for (let j = 0; j < N; j++)
      D_btwn[i * N + j] = angDiamDistBetween(planes[i].z, planes[j].z);
  }
  return { D_obs, D_btwn, N };
}

function deflectShear(ux, uy, gamma, phi) {
  const c2 = Math.cos(2 * phi), s2 = Math.sin(2 * phi);
  return [gamma * ( ux * c2 + uy * s2),
          gamma * ( ux * s2 - uy * c2)];
}

function lensDeflection(obj, ux, uy) {
  const { model, params } = obj;
  if (model === 'pointmass') return deflectPointMass(ux, uy, params.b);
  if (model === 'sie')       return deflectSIE(ux, uy, params.b, params.q, params.phi);
  if (model === 'nie')       return deflectNIE(ux, uy, params.b, params.q, params.phi, params.rc ?? 0.2);
  if (model === 'epl')       return deflectEPL(ux, uy, params.b, params.q, params.phi, params.gamma ?? 2);
  if (model === 'shear')       return deflectShear(ux + obj.cx, uy + obj.cy, params.gamma ?? 0.05, params.phi ?? 0); // absolute θ
  if (model === 'convergence') {
    const k = params.kappa ?? 0.05;
    const tx = ux + obj.cx, ty = uy + obj.cy; // absolute θ
    return [k * tx, k * ty];
  }
  if (model === 'deflection') {
    const a = params.alpha ?? 0.1, p = params.phi ?? 0;
    return [a * Math.cos(p), a * Math.sin(p)]; // constant, position-independent
  }
  return [0, 0];
}

export function traceRay(thetaX, thetaY, planes, dist, targetIdx) {
  const { D_obs, D_btwn, N } = dist;
  const posX = new Float64Array(targetIdx + 1);
  const posY = new Float64Array(targetIdx + 1);
  posX[0] = thetaX; posY[0] = thetaY;

  for (let j = 1; j <= targetIdx; j++) {
    const Dj = D_obs[j];
    if (Dj < 1e-9) { posX[j] = thetaX; posY[j] = thetaY; continue; }
    let dx = 0, dy = 0;
    for (let k = 0; k < j; k++) {
      const plane_k = planes[k];
      if (!plane_k.objects.some(o => !o.hidden && o.type === 'lens')) continue;
      const wt = D_btwn[k * N + j] / Dj;
      for (const obj of plane_k.objects) {
        if (obj.hidden || obj.type !== 'lens') continue;
        const [ax, ay] = lensDeflection(obj, posX[k] - obj.cx, posY[k] - obj.cy);
        dx += wt * ax; dy += wt * ay;
      }
    }
    posX[j] = thetaX - dx;
    posY[j] = thetaY - dy;
  }
  return [posX[targetIdx], posY[targetIdx]];
}

// ── Critical curves via marching squares ───────────────────────────────────
//
// Returns { critSegments, causticSegments } where each is an array of
// [[x0,y0],[x1,y1]] segment pairs (arcsec, image plane and source plane).
// Adjacent marching-squares cells share edge crossing points, so drawing
// the segments produces visually connected curves.

// Trace a uniform gridN×gridN grid of image-plane rays to sourcePlaneIdx and
// return the source-plane positions β(θ). Shared by the critical-curve and
// disc-outline contour extractors so a single trace can feed both when they run
// together (both are marching squares over the same β grid, just different fields).
export function traceSourceGrid(planes, dist, sourcePlaneIdx, fovArcsec, gridN) {
  const step = fovArcsec / (gridN - 1);
  const half = fovArcsec / 2;
  const bx = new Float32Array(gridN * gridN);
  const by = new Float32Array(gridN * gridN);
  for (let iy = 0; iy < gridN; iy++) {
    for (let ix = 0; ix < gridN; ix++) {
      const tx = -half + ix * step;
      const ty = -half + iy * step;
      const [sx, sy] = traceRay(tx, ty, planes, dist, sourcePlaneIdx);
      bx[iy * gridN + ix] = sx;
      by[iy * gridN + ix] = sy;
    }
  }
  return { bx, by, step, half, gridN, sourcePlaneIdx };
}

export function computeCriticalCurves(planes, dist, sourcePlaneIdx, fovArcsec, gridN = 128, grid = null) {
  const g0   = grid ?? traceSourceGrid(planes, dist, sourcePlaneIdx, fovArcsec, gridN);
  const bx   = g0.bx, by = g0.by, step = g0.step, half = g0.half;
  gridN      = g0.gridN;   // adopt the actual grid size when a precomputed grid is supplied

  // Jacobian det via central differences (border stays 0).
  const det = new Float32Array(gridN * gridN);
  for (let iy = 1; iy < gridN - 1; iy++) {
    for (let ix = 1; ix < gridN - 1; ix++) {
      const dbxdx = (bx[iy*gridN + ix+1] - bx[iy*gridN + ix-1]) / (2*step);
      const dbxdy = (bx[(iy+1)*gridN + ix] - bx[(iy-1)*gridN + ix]) / (2*step);
      const dbydx = (by[iy*gridN + ix+1] - by[iy*gridN + ix-1]) / (2*step);
      const dbydy = (by[(iy+1)*gridN + ix] - by[(iy-1)*gridN + ix]) / (2*step);
      det[iy*gridN+ix] = dbxdx * dbydy - dbxdy * dbydx;
    }
  }

  // Marching squares on (gridN-1)×(gridN-1) cells.
  const critSegments    = [];
  const causticSegments = [];

  for (let iy = 0; iy < gridN - 1; iy++) {
    for (let ix = 0; ix < gridN - 1; ix++) {
      const d00 = det[ iy   *gridN + ix  ],  d10 = det[ iy   *gridN + ix+1];
      const d01 = det[(iy+1)*gridN + ix  ],  d11 = det[(iy+1)*gridN + ix+1];

      // Skip cells with any zero-det corner (border or degenerate).
      if (d00 === 0 || d10 === 0 || d01 === 0 || d11 === 0) continue;

      const imgPts = [], srcPts = [];

      function edgeCrossing(da, db, ix_a, iy_a, ix_b, iy_b) {
        if (Math.sign(da) === Math.sign(db)) return;
        const t  = da / (da - db);
        const x  = -half + (ix_a + (ix_b - ix_a) * t) * step;
        const y  = -half + (iy_a + (iy_b - iy_a) * t) * step;
        const sx = bx[iy_a*gridN+ix_a] * (1-t) + bx[iy_b*gridN+ix_b] * t;
        const sy = by[iy_a*gridN+ix_a] * (1-t) + by[iy_b*gridN+ix_b] * t;
        imgPts.push([x, y]);
        srcPts.push([sx, sy]);
      }

      edgeCrossing(d00, d10,  ix,   iy,   ix+1, iy  ); // bottom
      edgeCrossing(d10, d11,  ix+1, iy,   ix+1, iy+1); // right
      edgeCrossing(d11, d01,  ix+1, iy+1, ix,   iy+1); // top
      edgeCrossing(d01, d00,  ix,   iy+1, ix,   iy  ); // left

      if (imgPts.length === 2) {
        critSegments.push([imgPts[0], imgPts[1]]);
        causticSegments.push([srcPts[0], srcPts[1]]);
      } else if (imgPts.length === 4) {
        // Saddle: two segments connecting pairs 0-1 and 2-3.
        critSegments.push([imgPts[0], imgPts[1]]);
        critSegments.push([imgPts[2], imgPts[3]]);
        causticSegments.push([srcPts[0], srcPts[1]]);
        causticSegments.push([srcPts[2], srcPts[3]]);
      }
    }
  }

  return { critSegments, causticSegments };
}

// ── Uniform-disc lensed-image outlines ──────────────────────────────────────
//
// A hard-edged elliptical disc source has a lensed image whose boundary is the
// zero level-set of g(θ) = r_ell(β(θ)) − r, where r_ell is the source's elliptical
// radius (same convention as the shader) and r its semi-major-axis radius. We
// extract that level-set by marching squares over the same β grid used for the
// critical curves, so the two share one trace when computed together.
//
// Adaptive quality (for the ragged/thin arcs near critical curves):
//   • Per-vertex SECANT REFINEMENT — the raw marching-squares crossing is placed
//     by linear interpolation of g along a cell edge, but g is strongly nonlinear
//     where the magnification is high. We refine each crossing with a few bounded
//     false-position steps that re-evaluate g by tracing that θ, pulling the vertex
//     onto the true contour. Cost scales with contour length, not grid area, and
//     the iterations self-concentrate exactly where g bends most (high μ).
// The extracted segments are meant to be chained (chainSegments) and optionally
// smoothed (smoothPolylines) before drawing.
export function computeDiscImageOutlines(planes, dist, sourcePlaneIdx, source, fovArcsec, gridN = 256, grid = null) {
  const g0   = grid ?? traceSourceGrid(planes, dist, sourcePlaneIdx, fovArcsec, gridN);
  const bx   = g0.bx, by = g0.by, step = g0.step, half = g0.half, N = g0.gridN;

  const r  = Math.max(source.r ?? source.sigma ?? 0.08, 1e-4);
  const q  = Math.max(source.q ?? 1, 0.05);
  const ph = source.phi ?? 0;
  const cp = Math.cos(ph), sp = Math.sin(ph);
  const cx = source.cx ?? 0, cy = source.cy ?? 0;

  // Elliptical radius of a source-plane point (matches renderer.js analyticalBrightness).
  const rEll = (betaX, betaY) => {
    const dx = betaX - cx, dy = betaY - cy;
    const xr = cp * dx + sp * dy;
    const yr = (-sp * dx + cp * dy) / q;
    return Math.hypot(xr, yr);
  };
  // g at grid nodes.
  const gf = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) gf[i] = rEll(bx[i], by[i]) - r;

  // g at an arbitrary image-plane point via a full multiplane trace (refinement only).
  const gAt = (tx, ty) => {
    const [sx, sy] = traceRay(tx, ty, planes, dist, sourcePlaneIdx);
    return rEll(sx, sy) - r;
  };

  const REFINE_IT = 3;   // bounded false-position steps per crossing
  const segments  = [];

  for (let iy = 0; iy < N - 1; iy++) {
    for (let ix = 0; ix < N - 1; ix++) {
      const g00 = gf[iy*N+ix],       g10 = gf[iy*N+ix+1];
      const g01 = gf[(iy+1)*N+ix],   g11 = gf[(iy+1)*N+ix+1];
      const pts = [];

      const edge = (ga, gb, ixa, iya, ixb, iyb) => {
        if (ga === gb) return;
        if ((ga < 0) === (gb < 0)) return;   // no sign change on this edge
        const xa = -half + ixa*step, ya = -half + iya*step;
        const xb = -half + ixb*step, yb = -half + iyb*step;
        // Bracketed false-position along the edge, re-tracing g at each guess.
        let tLo = 0, gLo = ga, tHi = 1, gHi = gb;
        let t = ga / (ga - gb);
        for (let it = 0; it < REFINE_IT; it++) {
          const gm = gAt(xa + t*(xb-xa), ya + t*(yb-ya));
          if (!isFinite(gm) || gm === 0) break;
          if ((gm < 0) === (gLo < 0)) { tLo = t; gLo = gm; }
          else                        { tHi = t; gHi = gm; }
          const tn = tLo + (tHi - tLo) * (gLo / (gLo - gHi));
          if (!isFinite(tn) || Math.abs(tn - t) < 1e-4) { t = tn; break; }
          t = tn;
        }
        t = Math.min(1, Math.max(0, t));
        pts.push([xa + t*(xb-xa), ya + t*(yb-ya)]);
      };

      edge(g00, g10, ix,   iy,   ix+1, iy  ); // bottom
      edge(g10, g11, ix+1, iy,   ix+1, iy+1); // right
      edge(g11, g01, ix+1, iy+1, ix,   iy+1); // top
      edge(g01, g00, ix,   iy+1, ix,   iy  ); // left

      if      (pts.length === 2) segments.push([pts[0], pts[1]]);
      else if (pts.length === 4) { segments.push([pts[0], pts[1]]); segments.push([pts[2], pts[3]]); }
    }
  }
  return segments;
}

// ── Segment chaining + smoothing (aesthetic vector output) ──────────────────
//
// Marching squares emits loose [[x0,y0],[x1,y1]] segments whose shared endpoints
// coincide exactly (adjacent cells refine the same edge identically). chainSegments
// links them into ordered polylines (closed loops repeat their first point at the
// end) so they can be stroked/filled cleanly and fed to the smoother.
export function chainSegments(segments, tol = 1e-4) {
  const key = (p) => `${Math.round(p[0] / tol)},${Math.round(p[1] / tol)}`;
  // Adjacency: endpoint key → list of { seg, end } references.
  const ends = new Map();
  const used = new Array(segments.length).fill(false);
  segments.forEach((s, i) => {
    for (const e of [0, 1]) {
      const k = key(s[e]);
      if (!ends.has(k)) ends.set(k, []);
      ends.get(k).push({ i, e });
    }
  });

  const takeFrom = (k, notI) => {
    const list = ends.get(k);
    if (!list) return null;
    for (const ref of list) if (!used[ref.i] && ref.i !== notI) return ref;
    return null;
  };

  const polylines = [];
  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const poly = [segments[i][0], segments[i][1]];
    // Extend forward from the tail.
    for (;;) {
      const ref = takeFrom(key(poly[poly.length - 1]), -1);
      if (!ref) break;
      used[ref.i] = true;
      poly.push(segments[ref.i][ref.e === 0 ? 1 : 0]);
    }
    // Extend backward from the head.
    for (;;) {
      const ref = takeFrom(key(poly[0]), -1);
      if (!ref) break;
      used[ref.i] = true;
      poly.unshift(segments[ref.i][ref.e === 0 ? 1 : 0]);
    }
    polylines.push(poly);
  }
  return polylines;
}

function _turnCos(a, b, c) {
  const ux = b[0]-a[0], uy = b[1]-a[1], vx = c[0]-b[0], vy = c[1]-b[1];
  const lu = Math.hypot(ux, uy), lv = Math.hypot(vx, vy);
  if (lu < 1e-12 || lv < 1e-12) return 1;
  return (ux*vx + uy*vy) / (lu * lv);
}

// Curvature-aware Chaikin corner-cutting. Vertices whose turn is sharper than
// cuspCos (a genuine cusp, e.g. a caustic point) are PINNED so smoothing rounds
// off sampling staircase without erasing real sharp features. Recomputed each pass.
export function smoothPolylines(polys, { iters = 2, cuspCos = -0.35 } = {}) {
  const chaikinPinned = (pts, closed, pin) => {
    const n = pts.length, out = [];
    if (!closed) out.push(pts[0]);
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      const q = pin[i]           ? a : [a[0]*0.75 + b[0]*0.25, a[1]*0.75 + b[1]*0.25];
      const r = pin[(i + 1) % n] ? b : [a[0]*0.25 + b[0]*0.75, a[1]*0.25 + b[1]*0.75];
      if (!out.length || out[out.length-1][0] !== q[0] || out[out.length-1][1] !== q[1]) out.push(q);
      if (out[out.length-1][0] !== r[0] || out[out.length-1][1] !== r[1]) out.push(r);
    }
    if (!closed) out.push(pts[n - 1]);
    return out;
  };

  return polys.map((poly) => {
    if (poly.length < 3) return poly;
    const closed = Math.hypot(poly[0][0]-poly[poly.length-1][0], poly[0][1]-poly[poly.length-1][1]) < 1e-9;
    let p = closed ? poly.slice(0, -1) : poly.slice();
    for (let k = 0; k < iters; k++) {
      if (p.length < 3) break;
      const pin = p.map((_, i) => {
        if (!closed && (i === 0 || i === p.length - 1)) return true;   // keep open endpoints
        const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length];
        return _turnCos(a, b, c) < cuspCos;
      });
      p = chaikinPinned(p, closed, pin);
    }
    if (closed && p.length) p.push(p[0]);
    return p;
  });
}
