// Caustica — lens.js
//
// Cosmological distances (flat ΛCDM) and gravitational lens deflection angles.
// All angular quantities in arcseconds. Distances in Mpc.

// ── Cosmology ──────────────────────────────────────────────────────────────

const H0      = 70;
const Omega_m = 0.3;
const Omega_L = 0.7;
const C_LIGHT = 2.998e5;
const DH      = C_LIGHT / H0;

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

// ── Lens deflection angles ─────────────────────────────────────────────────

const EPS      = 1e-12;
const SIE_SOFT = 0.001;

export function deflectPointMass(ux, uy, thetaE) {
  const r2 = Math.max(ux*ux + uy*uy, SIE_SOFT * SIE_SOFT);
  return [thetaE * thetaE / r2 * ux, thetaE * thetaE / r2 * uy];
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

// EPL — same formulation as the shader: SIE deflections scaled by (m/b)^(2-gamma).
export function deflectEPL(ux, uy, b, q, phi, gamma) {
  const cp = Math.cos(phi), sp = Math.sin(phi);
  const xr =  cp*ux + sp*uy;
  const yr = -sp*ux + cp*uy;
  const qs  = Math.max(q, 0.001);
  const sqf = Math.sqrt(Math.max(1 - qs*qs, EPS));
  const s   = SIE_SOFT;
  const m   = Math.sqrt(qs*qs*(xr*xr + s*s) + yr*yr);
  const A   = b * qs / sqf;
  const ax_sie = A * Math.atan2(sqf * xr, m + s);
  const ay_sie = A * 0.5 * Math.log((1 + sqf*yr/(m + qs*qs*s)) /
                                      Math.max(1 - sqf*yr/(m + qs*qs*s), EPS));
  const scale = Math.pow(Math.max(m / Math.max(b, EPS), EPS), 2.0 - gamma);
  const ax = scale * ax_sie, ay = scale * ay_sie;
  return [cp*ax - sp*ay, sp*ax + cp*ay];
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
  if (model === 'pointmass') return deflectPointMass(ux, uy, params.thetaE);
  if (model === 'sie')       return deflectSIE(ux, uy, params.b, params.q, params.phi);
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

export function computeCriticalCurves(planes, dist, sourcePlaneIdx, fovArcsec, gridN = 128) {
  const step = fovArcsec / (gridN - 1);
  const half = fovArcsec / 2;

  // Sample source positions at corner grid.
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
