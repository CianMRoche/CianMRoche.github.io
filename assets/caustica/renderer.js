// Caustica — renderer.js
//
// WebGL2 renderer. One fullscreen quad; the fragment shader implements the
// complete multiplane lensing computation for every pixel in parallel.
// WebGL2 (GLSL 300 es) is required to allow dynamic uniform-array indexing.
//
// Pasted-image sources: up to MAX_PASTED = 4 simultaneously, each stored in
// its own texture slot.  The shader outputs full RGB so pasted images retain
// their original color; analytical sources produce white light as before.
//
// Public API:
//   const r = new Renderer(canvas)
//   r.setScene(planes, dist, fovArcsec)
//   r.setPastedTexture(objId, canvas)   — call after pasting an image
//   r.clearPastedTexture(objId)         — call when object is deleted
//   r.resize()
//   r.destroy()

const MAX_PLANES  = 6;
const MAX_OBJECTS = 10;
const MAX_PASTED  = 4;   // simultaneous pasted-image texture slots

// ── Vertex shader ─────────────────────────────────────────────────────────────
const VERT_SRC =
`#version 300 es
in  vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv        = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

// ── Fragment shader ───────────────────────────────────────────────────────────
const FRAG_SRC =
`#version 300 es
precision highp float;
in  vec2 v_uv;
out vec4 fragColor;

const int   MAX_PLANES  = ${MAX_PLANES};
const int   MAX_OBJECTS = ${MAX_OBJECTS};
const float EPS         = 1.0e-9;
const float SIE_SOFT    = 0.001;

// ── Uniforms ──────────────────────────────────────────────────────────────────

uniform float u_fov;
uniform vec2  u_res;
uniform int   u_vizScale;     // value→[0,1] warp: 0=linear 1=sqrt 2=power 3=asinh 4=log
uniform float u_vizScaleParam; // γ for power, softening a for asinh
uniform float u_vizMin;        // lower data limit mapped to colorbar 0
uniform float u_vizMax;        // upper data limit mapped to colorbar 1
uniform int   u_colormap;      // palette: 0=default 1=viridis 2=inferno 3=plasma 4=turbo 5=gray
uniform int   u_vizMode;      // 0=surface brightness, 1=κ, 2=γ, 3=|μ|, 4=signed μ, 5=|α|, 6=φ (Fermat)
uniform int   u_vizSrcIdx;    // target plane index for visualization Jacobian
uniform int   u_isDark;       // 1 = dark theme, 0 = light theme
uniform float u_saddlePhi[8]; // φ values at Type-II saddle images (Fermat mode)
uniform int   u_nSaddle;      // number of valid entries in u_saddlePhi
uniform vec2  u_fermatBeta;   // source position β_s for Fermat potential (arcsec)

uniform float u_D_obs [${MAX_PLANES}];
uniform float u_D_btwn[${MAX_PLANES * MAX_PLANES}];
uniform float u_chi   [${MAX_PLANES}]; // comoving distances χ_j = (1+z_j)·D_obs[j]

uniform int   u_numPlanes;
uniform int   u_planeType[${MAX_PLANES}];

uniform int   u_numLenses;
uniform int   u_lensModel   [${MAX_OBJECTS}];
uniform int   u_lensPlaneIdx[${MAX_OBJECTS}];
uniform vec2  u_lensCenter  [${MAX_OBJECTS}];
uniform vec4  u_lensParams  [${MAX_OBJECTS}];

uniform int   u_numSources;
uniform int   u_srcPlaneIdx [${MAX_OBJECTS}];
uniform vec2  u_srcCenter   [${MAX_OBJECTS}];
uniform vec4  u_srcParams   [${MAX_OBJECTS}]; // [sigma, q, phi, amplitude]
uniform int   u_srcModel    [${MAX_OBJECTS}]; // 0=gaussian 1=exponential 3=pastedimage
uniform vec3  u_srcColor    [${MAX_OBJECTS}]; // tint for analytical sources (1,1,1 = white)

// Per-source pasted-image slot (-1 = not a pasted image, 0-3 = texture slot).
uniform int   u_pastedSlot  [${MAX_OBJECTS}];
// Four independent texture samplers + their image sizes in arcsec.
// Sampler arrays cannot be dynamically indexed in GLSL ES; use if-else.
uniform sampler2D u_pastedTex0;
uniform sampler2D u_pastedTex1;
uniform sampler2D u_pastedTex2;
uniform sampler2D u_pastedTex3;
uniform vec2 u_pastedSz0;
uniform vec2 u_pastedSz1;
uniform vec2 u_pastedSz2;
uniform vec2 u_pastedSz3;

// ── Lens deflection angles ────────────────────────────────────────────────────

float atanh_approx(float x) {
  x = clamp(x, -0.9999, 0.9999);
  return 0.5 * log((1.0 + x) / (1.0 - x));
}

vec2 deflectPointMass(vec2 u, float thetaE) {
  // Softened point mass: same core radius as SIE to prevent singularity.
  // Physically negligible at the scales typical in Caustica.
  float r2 = max(dot(u, u), SIE_SOFT * SIE_SOFT);
  return (thetaE * thetaE / r2) * u;
}

vec2 deflectSIE(vec2 u, float b, float q, float phi) {
  float cp = cos(phi), sp = sin(phi);
  float xr =  cp * u.x + sp * u.y;
  float yr = -sp * u.x + cp * u.y;
  float qs = max(q, 0.001);
  float sqf = sqrt(max(1.0 - qs * qs, EPS));
  float s = SIE_SOFT;
  float r = sqrt(qs * qs * (xr * xr + s * s) + yr * yr);
  float A = b * qs / sqf;
  float ax = A * atan(sqf * xr / (r + s));
  float ay = A * atanh_approx(sqf * yr / (r + qs * qs * s));
  return vec2(cp * ax - sp * ay, sp * ax + cp * ay);
}

// NIE — Nonsingular Isothermal Ellipsoid.
// Identical to SIE but with a user-specified core radius rc instead of the
// numerical softening floor, producing a finite central surface density.
vec2 deflectNIE(vec2 u, float b, float q, float phi, float rc) {
  float cp = cos(phi), sp = sin(phi);
  float xr =  cp * u.x + sp * u.y;
  float yr = -sp * u.x + cp * u.y;
  float qs = max(q, 0.001);
  float sqf = sqrt(max(1.0 - qs * qs, EPS));
  float s = max(rc, SIE_SOFT);
  float r = sqrt(qs * qs * (xr * xr + s * s) + yr * yr);
  float A = b * qs / sqf;
  float ax = A * atan(sqf * xr / (r + s));
  float ay = A * atanh_approx(sqf * yr / (r + qs * qs * s));
  return vec2(cp * ax - sp * ay, sp * ax + cp * ay);
}

// EPL — Elliptical Power Law.
// Computed as SIE deflections scaled by the radial power (m/b)^(2-gamma).
// At gamma=2 this reduces exactly to the SIE; other values adjust the
// density slope while preserving the elliptical geometry.
vec2 deflectEPL(vec2 u, float b, float q, float phi, float gamma) {
  float cp = cos(phi), sp = sin(phi);
  float xr =  cp * u.x + sp * u.y;
  float yr = -sp * u.x + cp * u.y;
  float qs  = max(q, 0.001);
  float sqf = sqrt(max(1.0 - qs * qs, EPS));
  float s   = SIE_SOFT;
  float m   = sqrt(qs * qs * (xr * xr + s * s) + yr * yr);
  float A   = b * qs / sqf;
  float ax_sie = A * atan(sqf * xr / (m + s));
  float ay_sie = A * atanh_approx(sqf * yr / (m + qs * qs * s));
  // Power-law scale factor; equals 1 when gamma=2 (pure SIE).
  float power = 2.0 - gamma;
  float scale = pow(max(m / max(b, EPS), EPS), power);
  return vec2(cp * scale*ax_sie - sp * scale*ay_sie,
              sp * scale*ax_sie + cp * scale*ay_sie);
}

vec2 deflectShear(vec2 u, float gamma, float phi) {
  float c2 = cos(2.0 * phi), s2 = sin(2.0 * phi);
  return vec2(gamma * ( u.x * c2 + u.y * s2),
              gamma * ( u.x * s2 - u.y * c2));
}

vec2 lensDeflection(int idx, vec2 pos) {
  vec2 u = pos - u_lensCenter[idx];
  vec4 p = u_lensParams[idx];
  int  m = u_lensModel[idx];
  if (m == 0) return deflectPointMass(u, p.x);
  if (m == 1) return deflectSIE(u, p.x, p.y, p.z);
  if (m == 2) return deflectEPL(u, p.x, p.y, p.z, p.w);
  if (m == 6) return deflectNIE(u, p.x, p.y, p.z, p.w);
  if (m == 3) return deflectShear(pos, p.x, p.y); // shear is relative to origin, not object centre
  if (m == 4) return p.x * pos;                                      // external convergence: kappa * theta
  if (m == 5) return vec2(p.x * cos(p.y), p.x * sin(p.y));          // constant deflection: alpha*(cos phi, sin phi)
  return vec2(0.0);
}

// ── Lensing potentials (analytic ψ per model) ────────────────────────────────
// Returns ψ(pos) such that ∇ψ = α (the deflection angle) for each model.
// Used to compute the Fermat potential φ = ½|θ|² − Σ_k (D_{k,s}/D_s) ψ_k(θ_k).
// EPL returns 0 (potential has no closed form for the scaled-SIE approximation).

float lensPotential(int idx, vec2 pos) {
  vec2 u = pos - u_lensCenter[idx];
  vec4 p = u_lensParams[idx];
  int  m = u_lensModel[idx];

  // Point mass: ψ = θ_E² · ln |u|
  if (m == 0) {
    return p.x * p.x * log(max(length(u), SIE_SOFT));
  }

  // SIE (m=1) or NIE (m=6): ψ = A · [xr·atan(…) + yr·atanh(…)]
  // This satisfies ∇ψ = α exactly for isothermal-family models.
  if (m == 1 || m == 6) {
    float b = p.x, phi = p.z;
    float qs  = max(p.y, 0.001);
    float s   = (m == 6) ? max(p.w, SIE_SOFT) : SIE_SOFT;
    float sqf = sqrt(max(1.0 - qs * qs, EPS));
    float cp = cos(phi), sp = sin(phi);
    float xr =  cp * u.x + sp * u.y;
    float yr = -sp * u.x + cp * u.y;
    float r  = sqrt(qs * qs * (xr * xr + s * s) + yr * yr);
    float A  = b * qs / sqf;
    return A * (xr * atan(sqf * xr / (r + s))
              + yr * atanh_approx(sqf * yr / (r + qs * qs * s)));
  }

  // EPL: scaled-SIE deflections do not admit a closed-form potential.
  if (m == 2) return 0.0;

  // External shear: ψ = γ/2 · [(x²−y²)·cos2φ + 2xy·sin2φ]  (absolute pos)
  if (m == 3) {
    float c2 = cos(2.0 * p.y), s2 = sin(2.0 * p.y);
    return 0.5 * p.x * ((pos.x * pos.x - pos.y * pos.y) * c2
                       + 2.0 * pos.x * pos.y * s2);
  }

  // External convergence: ψ = κ/2 · |θ|²  (absolute pos)
  if (m == 4) return 0.5 * p.x * dot(pos, pos);

  // Uniform deflection: ψ = α · (x·cosφ + y·sinφ)  (absolute pos)
  if (m == 5) return p.x * (pos.x * cos(p.y) + pos.y * sin(p.y));

  return 0.0;
}

// Variant of traceToPlane that also accumulates the multiplane effective
// lensing potential  ψ_eff = Σ_k (D_{k,s}/D_s) · ψ_k(θ_k).
vec2 traceToPlaneWithPsi(vec2 theta, int targetIdx, inout float psiEff) {
  float Ds = u_D_obs[targetIdx];
  vec2 pos[${MAX_PLANES}];
  for (int j = 0; j < MAX_PLANES; j++) pos[j] = theta;

  psiEff = 0.0;
  vec2 result = theta;
  for (int j = 0; j < MAX_PLANES; j++) {
    if (j >= u_numPlanes) break;
    float Dj = u_D_obs[j];
    vec2 totalDefl = vec2(0.0);
    for (int k = 0; k < MAX_PLANES; k++) {
      if (k >= j) break;
      if (u_planeType[k] != 0) continue;
      float Dkj = u_D_btwn[k * MAX_PLANES + j];
      if (Dj < EPS || Dkj < EPS) continue;
      float wt = Dkj / Dj;
      for (int li = 0; li < MAX_OBJECTS; li++) {
        if (li >= u_numLenses) break;
        if (u_lensPlaneIdx[li] != k) continue;
        totalDefl += wt * lensDeflection(li, pos[k]);
      }
    }
    pos[j] = theta - totalDefl;
    if (j == targetIdx) { result = pos[j]; break; }

    // Accumulate potential at each lens plane weighted by D_{j,s}/D_s
    if (u_planeType[j] == 0 && Ds > EPS) {
      float Djs = u_D_btwn[j * MAX_PLANES + targetIdx];
      if (Djs > EPS) {
        float wPsi = Djs / Ds;
        for (int li = 0; li < MAX_OBJECTS; li++) {
          if (li >= u_numLenses) break;
          if (u_lensPlaneIdx[li] != j) continue;
          psiEff += wPsi * lensPotential(li, pos[j]);
        }
      }
    }
  }
  return result;
}

// Physically correct multiplane Fermat (arrival-time) surface φ(θ; β_s).
//
// Built in COMOVING transverse coordinates η_j = χ_j·x_j, where x_j is the angular
// ray position at plane j. The arrival-time surface is a sum of geometric path-length
// terms over a reduced node sequence that includes ONLY the deflecting (lens) planes:
//
//     observer (χ=0, η=0) → each lens plane (χ_j, η_j) → source (χ_s, η_s=χ_s·β_s)
//     φ_raw = Σ_segments ½|Δη|²/Δχ  −  Σ_lens χ_j·ψ_j(x_j)
//
// Empty planes are skipped entirely: a ray drifts in a straight comoving line between
// deflections, so omitting empty planes is exact AND makes φ invariant to inserting or
// moving empty planes (the reduced sequence is identical regardless of empty planes).
// The source node is pinned to β_s (u_fermatBeta), so stationary points coincide with
// image positions.  φ is normalised by K = χ_L·χ_s/(χ_s−χ_L) (χ_L = first lens plane)
// so that the single-plane case reduces exactly to ½|θ−β_s|²−ψ and the field stays O(1).
float fermatPotential(vec2 theta, int targetIdx) {
  float chi_s = u_chi[targetIdx];
  if (chi_s < EPS) return 0.0;

  // ── Pass 1: trace angular positions x_j at every plane up to the source. ──
  vec2 pos[${MAX_PLANES}];
  for (int j = 0; j < MAX_PLANES; j++) pos[j] = theta;
  for (int j = 1; j < MAX_PLANES; j++) {
    if (j > targetIdx) break;
    float Dj = u_D_obs[j];
    vec2 totalDefl = vec2(0.0);
    if (Dj > EPS) {
      for (int k = 0; k < MAX_PLANES; k++) {
        if (k >= j) break;
        if (u_planeType[k] != 0) continue;
        float Dkj = u_D_btwn[k * MAX_PLANES + j];
        if (Dkj < EPS) continue;
        float wt = Dkj / Dj;
        for (int li = 0; li < MAX_OBJECTS; li++) {
          if (li >= u_numLenses) break;
          if (u_lensPlaneIdx[li] != k) continue;
          totalDefl += wt * lensDeflection(li, pos[k]);
        }
      }
    }
    pos[j] = theta - totalDefl;
  }

  // ── Pass 2: reduced comoving arrival-time surface, skipping empty planes. ──
  float prevChi  = 0.0;          // observer node: χ=0, η=0
  vec2  prevEta  = vec2(0.0);
  float chi_L    = -1.0;         // first lens plane comoving distance (for normalisation)
  float geoDelay = 0.0;
  float psiEff   = 0.0;
  for (int j = 0; j < MAX_PLANES; j++) {
    if (j >= targetIdx) break;
    if (u_planeType[j] != 0) continue;        // skip empty planes
    float chi_j = u_chi[j];
    if (chi_j - prevChi < EPS) continue;
    if (chi_L < 0.0) chi_L = chi_j;
    vec2 eta_j = chi_j * pos[j];
    vec2 de    = eta_j - prevEta;
    geoDelay  += 0.5 * dot(de, de) / (chi_j - prevChi);
    prevChi    = chi_j;
    prevEta    = eta_j;
    for (int li = 0; li < MAX_OBJECTS; li++) {
      if (li >= u_numLenses) break;
      if (u_lensPlaneIdx[li] != j) continue;
      psiEff += chi_j * lensPotential(li, pos[j]);
    }
  }
  // Final drift to the source plane, pinned at β_s.
  vec2 etaS = chi_s * u_fermatBeta;
  vec2 deS  = etaS - prevEta;
  if (chi_s - prevChi > EPS) geoDelay += 0.5 * dot(deS, deS) / (chi_s - prevChi);

  float phi = geoDelay - psiEff;

  // Normalise so single-plane reduces to ½|θ−β_s|²−ψ and the field stays O(1).
  if (chi_L > 0.0 && chi_s - chi_L > EPS) {
    float K = chi_L * chi_s / (chi_s - chi_L);
    phi /= K;
  } else {
    phi /= chi_s;                              // no lens planes: pure geometric fallback
  }
  return phi;
}

// ── Pasted image sampling ─────────────────────────────────────────────────────
// Returns the pasted image color (RGB) for source idx at source-plane
// position beta.  Uses an if-else chain to avoid dynamic sampler indexing.

vec3 samplePasted(int idx, vec2 beta) {
  int  slot = u_pastedSlot[idx];
  vec2 sz;
  if      (slot == 0) sz = u_pastedSz0;
  else if (slot == 1) sz = u_pastedSz1;
  else if (slot == 2) sz = u_pastedSz2;
  else                sz = u_pastedSz3;

  vec2 uv = (beta - u_srcCenter[idx]) / sz + 0.5;
  uv.y = 1.0 - uv.y;  // WebGL textures: first data row (canvas top) is at t=0
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))))
    return vec3(0.0);

  vec4 col;
  if      (slot == 0) col = texture(u_pastedTex0, uv);
  else if (slot == 1) col = texture(u_pastedTex1, uv);
  else if (slot == 2) col = texture(u_pastedTex2, uv);
  else                col = texture(u_pastedTex3, uv);

  // Smooth fade at edges to avoid hard border artifacts.
  vec2 edgeDist = min(uv, 1.0 - uv);
  float fade = smoothstep(0.0, 0.015, min(edgeDist.x, edgeDist.y));

  return u_srcParams[idx].w * col.rgb * fade;
}

// ── Analytical source brightness (white) ──────────────────────────────────────

float analyticalBrightness(int idx, vec2 beta) {
  vec4 p   = u_srcParams[idx];
  vec2 dp  = beta - u_srcCenter[idx];
  float q  = max(p.y, 0.05);
  float ph = p.z;
  float cp = cos(ph), sp = sin(ph);
  float xr = cp * dp.x + sp * dp.y;
  float yr = (-sp * dp.x + cp * dp.y) / q;
  float r2 = xr * xr + yr * yr;
  float sig = max(p.x, 0.01);
  float amp = p.w;
  if (u_srcModel[idx] == 1) return amp * exp(-sqrt(r2) / sig);
  if (u_srcModel[idx] == 4) {
    // Uniform circle: constant brightness inside radius sig, zero outside.
    return (sqrt(r2) <= sig) ? amp : 0.0;
  }
  if (u_srcModel[idx] == 5) {
    return 0.0; // rendered in overlay as fixed-size circles
  }
  return amp * exp(-r2 / (2.0 * sig * sig));
}

// ── Multiplane ray tracer ─────────────────────────────────────────────────────

vec2 traceToPlane(vec2 theta, int targetIdx) {
  vec2 pos[${MAX_PLANES}];
  for (int j = 0; j < MAX_PLANES; j++) pos[j] = theta;

  vec2 result = theta;
  for (int j = 0; j < MAX_PLANES; j++) {
    if (j >= u_numPlanes) break;
    float Dj = u_D_obs[j];
    vec2 totalDefl = vec2(0.0);
    for (int k = 0; k < MAX_PLANES; k++) {
      if (k >= j) break;
      if (u_planeType[k] != 0) continue;
      float Dkj = u_D_btwn[k * MAX_PLANES + j];
      if (Dj < EPS || Dkj < EPS) continue;
      float wt = Dkj / Dj;
      for (int li = 0; li < MAX_OBJECTS; li++) {
        if (li >= u_numLenses) break;
        if (u_lensPlaneIdx[li] != k) continue;
        totalDefl += wt * lensDeflection(li, pos[k]);
      }
    }
    pos[j] = theta - totalDefl;
    if (j == targetIdx) { result = pos[j]; break; }
  }
  return result;
}

// ── Colormaps ─────────────────────────────────────────────────────────────────

// Diverging colormaps.
// Light: blue → white (neutral) → red.
// Dark:  black → blue → dark navy (neutral) → orange-red; matches seismic at the extremes.
vec3 cmDiverge(float t) {
  t = clamp(t, -1.0, 1.0);
  if (u_isDark == 1) {
    vec3 ctr = vec3(0.07, 0.07, 0.14);
    vec3 neg = vec3(0.25, 0.50, 1.00);
    vec3 pos = vec3(1.00, 0.35, 0.12);
    if (t < 0.0) {
      float s = -t; // 0..1 for negative half
      if (s < 0.5) return mix(ctr, neg, s * 2.0);
      else         return mix(neg, vec3(0.0), (s - 0.5) * 2.0);
    }
    return mix(ctr, pos, t);
  } else {
    vec3 neg = vec3(0.22, 0.42, 0.92);
    vec3 pos = vec3(0.92, 0.28, 0.18);
    if (t < 0.0) return mix(vec3(1.0), neg, -t);
    else          return mix(vec3(1.0), pos,  t);
  }
}

// Sequential colormaps.
// Dark:  very dark → dark purple → orange → yellow (t=0 ≈ canvas bg).
// Light: white → orange → purple → black  (t=0 = white = canvas bg).
vec3 cmSequential(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 a, b, c, d;
  if (u_isDark == 1) {
    a = vec3(0.00, 0.00, 0.04);
    b = vec3(0.36, 0.00, 0.36);
    c = vec3(0.90, 0.43, 0.00);
    d = vec3(1.00, 0.90, 0.00);
  } else {
    a = vec3(1.00, 1.00, 1.00); // white — matches light canvas bg
    b = vec3(1.00, 0.55, 0.00); // orange
    c = vec3(0.45, 0.00, 0.55); // purple
    d = vec3(0.00, 0.00, 0.00); // black
  }
  if (t < 0.33) return mix(a, b, t * 3.0);
  if (t < 0.66) return mix(b, c, (t - 0.33) * 3.0);
  return mix(c, d, (t - 0.66) * 3.0);
}

// Standard perceptual colormaps via compact polynomial fits (after Matt Zucker's
// "Optimized colormaps"). All map t∈[0,1] → RGB and are theme-independent.
vec3 cmViridis(float t) {
  const vec3 c0 = vec3(0.2777, 0.0054, 0.3341);
  const vec3 c1 = vec3(0.1051, 1.4046, 1.3846);
  const vec3 c2 = vec3(-0.3308, 0.2148, 0.0951);
  const vec3 c3 = vec3(-4.6342, -5.7991, -19.3324);
  const vec3 c4 = vec3(6.2283, 14.1799, 56.6906);
  const vec3 c5 = vec3(4.7764, -13.7451, -65.3530);
  const vec3 c6 = vec3(-5.4355, 4.6459, 26.3124);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 cmInferno(float t) {
  const vec3 c0 = vec3(0.0002, 0.0016, -0.0194);
  const vec3 c1 = vec3(0.1065, 0.5639, 3.9327);
  const vec3 c2 = vec3(11.6024, -3.9728, -15.9423);
  const vec3 c3 = vec3(-41.7039, 17.4363, 44.3540);
  const vec3 c4 = vec3(77.1629, -33.4023, -81.8073);
  const vec3 c5 = vec3(-71.3194, 32.6261, 73.2095);
  const vec3 c6 = vec3(25.1311, -12.2426, -23.0703);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 cmPlasma(float t) {
  const vec3 c0 = vec3(0.0587, 0.0233, 0.5433);
  const vec3 c1 = vec3(2.1761, 0.2380, 0.7539);
  const vec3 c2 = vec3(-2.6894, -7.4554, 3.1107);
  const vec3 c3 = vec3(6.1305, 42.3461, -28.5188);
  const vec3 c4 = vec3(-11.1074, -82.6663, 60.1399);
  const vec3 c5 = vec3(10.0233, 71.4136, -54.0721);
  const vec3 c6 = vec3(-3.6587, -22.9315, 18.1919);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}
vec3 cmTurbo(float t) {
  const vec3 c0 = vec3(0.1140, 0.0628, 0.2248);
  const vec3 c1 = vec3(6.7164, 3.1822, 7.5715);
  const vec3 c2 = vec3(-66.0941, -4.9279, -10.0934);
  const vec3 c3 = vec3(228.7660, 25.0498, -91.5410);
  const vec3 c4 = vec3(-334.8334, -69.3174, 288.5858);
  const vec3 c5 = vec3(218.7637, 67.5215, -305.2045);
  const vec3 c6 = vec3(-52.8895, -21.5453, 110.5174);
  return c0 + t * (c1 + t * (c2 + t * (c3 + t * (c4 + t * (c5 + t * c6)))));
}

// Quantity-map colormap selector (u_colormap): 0=default 1=viridis 2=inferno
// 3=plasma 4=turbo 5=grayscale.
vec3 applyColormap(float t) {
  t = clamp(t, 0.0, 1.0);
  if (u_colormap == 1) return clamp(cmViridis(t), 0.0, 1.0);
  if (u_colormap == 2) return clamp(cmInferno(t), 0.0, 1.0);
  if (u_colormap == 3) return clamp(cmPlasma(t),  0.0, 1.0);
  if (u_colormap == 4) return clamp(cmTurbo(t),   0.0, 1.0);
  if (u_colormap == 5) return vec3(t);
  return cmSequential(t);
}

// ── Value → [0,1] warp ─────────────────────────────────────────────────────────
// Maps a raw quantity v into [0,1] given user limits [lo,hi] and a scale function.
// linear/sqrt/power/asinh act on the linearly-normalised position (so with lo=0,hi=1
// they reproduce the classic tone-map curves exactly); log is a true data-unit axis.
float vizWarp(float v, float lo, float hi, int scale, float p) {
  if (scale == 4) {                                  // log (needs a positive range)
    float L = log(max(lo, EPS)), H = log(max(hi, EPS));
    return clamp((log(max(v, EPS)) - L) / max(H - L, EPS), 0.0, 1.0);
  }
  float u = clamp((v - lo) / max(hi - lo, EPS), 0.0, 1.0);
  if (scale == 1) return sqrt(u);                    // square root
  if (scale == 2) return pow(u, max(p, EPS));        // power law γ
  if (scale == 3) {                                  // asinh, softening a = p
    float a = max(p, EPS);
    return asinh(a * u) / max(asinh(a), EPS);
  }
  return u;                                          // linear
}

// ── Visualization Jacobian ────────────────────────────────────────────────────

vec3 computeViz(vec2 theta) {
  int tgt = u_vizSrcIdx;

  // Fermat potential — contour lines of the arrival-time surface φ(θ; β_s).
  // Single blue line color; fades toward the edge; saddle-level contours
  // are thicker and brighter. fwidth() auto-fades where contours are too
  // dense to resolve (outer field far from lens).
  if (u_vizMode == 6) {
    float phi = fermatPotential(theta, tgt);
    float interval = max(u_fov * u_fov * 0.002, EPS);
    float phi_n    = phi / interval;
    float fw       = fwidth(phi_n) * 0.5;
    float d        = min(fract(phi_n), 1.0 - fract(phi_n));

    // Identify whether this contour level matches a Type-II saddle image.
    float phi_level = floor(phi_n + 0.5);
    bool isSaddle = false;
    for (int i = 0; i < 8; i++) {
      if (i >= u_nSaddle) break;
      if (abs(phi_level - floor(u_saddlePhi[i] / interval + 0.5)) < 0.5) {
        isSaddle = true; break;
      }
    }

    float lineW  = isSaddle ? fw * 6.0 : fw * 2.0;
    float alpha  = fw < 0.5 ? (1.0 - smoothstep(fw, lineW, d)) : 0.0;

    // Fade toward the FOV edge (starts at 60% of half-FOV, reaches zero at 105%).
    float edgeFade = 1.0 - smoothstep(0.60, 1.05, length(theta) / (u_fov * 0.5));

    vec3  bg      = u_isDark == 1 ? vec3(0.05, 0.04, 0.07) : vec3(0.95, 0.95, 0.95);
    vec3  lineCol = isSaddle
      ? (u_isDark == 1 ? vec3(0.95, 0.98, 1.00) : vec3(0.02, 0.04, 0.08))
      : (u_isDark == 1 ? vec3(0.50, 0.75, 1.00) : vec3(0.15, 0.35, 0.78));
    return mix(bg, lineCol, alpha * edgeFade);
  }

  float h = u_fov * 0.004; // finite-difference step (~0.016" at fov=4)
  vec2 bpx = traceToPlane(theta + vec2(h, 0.0), tgt);
  vec2 bmx = traceToPlane(theta - vec2(h, 0.0), tgt);
  vec2 bpy = traceToPlane(theta + vec2(0.0, h), tgt);
  vec2 bmy = traceToPlane(theta - vec2(0.0, h), tgt);

  // Jacobian A_ij = d beta_i / d theta_j  (traceToPlane returns beta directly)
  float A11 = (bpx.x - bmx.x) / (2.0*h);
  float A12 = (bpy.x - bmy.x) / (2.0*h);
  float A21 = (bpx.y - bmx.y) / (2.0*h);
  float A22 = (bpy.y - bmy.y) / (2.0*h);

  float detJ  = A11*A22 - A12*A21;
  float kappa = 1.0 - 0.5*(A11 + A22);
  float g1    = 0.5*(A22 - A11);
  float g2    = -0.5*(A12 + A21);
  float gamma = sqrt(g1*g1 + g2*g2);

  if (u_vizMode == 1) { // convergence κ (clamped ≥ 0)
    return applyColormap(vizWarp(max(kappa, 0.0), u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam));
  }
  if (u_vizMode == 2) { // shear |γ|
    return applyColormap(vizWarp(gamma, u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam));
  }
  if (u_vizMode == 3) { // |magnification|
    float mu = 1.0 / max(abs(detJ), 0.001);
    return applyColormap(vizWarp(mu, u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam));
  }
  if (u_vizMode == 4) { // signed magnification: diverging
    float muS = clamp(1.0 / detJ, -8.0, 8.0);
    return cmDiverge(muS * 0.15);
  }
  // u_vizMode == 5: deflection |α|
  vec2 beta = (bpx + bmx) * 0.5;
  return applyColormap(vizWarp(length(theta - beta), u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam));
}

// ── Main ──────────────────────────────────────────────────────────────────────

void main() {
  vec2 theta = (v_uv - 0.5) * u_fov;

  // Visualization modes bypass normal rendering.
  if (u_vizMode != 0) {
    fragColor = vec4(computeViz(theta), 1.0);
    return;
  }

  vec3 colorOut = vec3(0.0);
  for (int si = 0; si < MAX_OBJECTS; si++) {
    if (si >= u_numSources) break;
    vec2 beta = traceToPlane(theta, u_srcPlaneIdx[si]);
    if (u_srcModel[si] == 3) {
      colorOut += samplePasted(si, beta);
    } else {
      colorOut += u_srcColor[si] * analyticalBrightness(si, beta);
    }
  }

  colorOut = clamp(colorOut, 0.0, 1.0);
  // Surface-brightness stretch: same [min,max]+scale warp as the quantity maps,
  // applied per colour channel (min=black point, max=white point).
  colorOut = vec3(
    vizWarp(colorOut.r, u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam),
    vizWarp(colorOut.g, u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam),
    vizWarp(colorOut.b, u_vizMin, u_vizMax, u_vizScale, u_vizScaleParam)
  );
  fragColor = vec4(colorOut, 1.0);
}`;

// ── Renderer class ────────────────────────────────────────────────────────────

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: false, depth: false, preserveDrawingBuffer: true });
    if (!gl) throw new Error('WebGL2 not available in this browser.');
    this.gl = gl;

    this._prog  = this._buildProgram(VERT_SRC, FRAG_SRC);
    this._quad  = this._buildQuad();
    this._locs  = this._getLocations();
    this._scene = null;

    // Cache: objId → { tex: WebGLTexture, w, h }
    this._pastedTexCache = new Map();
    // Dummy 1×1 black texture for unoccupied slots.
    this._dummyTex = this._buildDummyTex();
  }

  // Upload (or update) the pasted image for a specific source object.
  setPastedTexture(objId, imageCanvas) {
    const { gl } = this;
    const old = this._pastedTexCache.get(objId);
    if (old) gl.deleteTexture(old.tex);
    if (!imageCanvas) { this._pastedTexCache.delete(objId); return; }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, imageCanvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this._pastedTexCache.set(objId, { tex, w: imageCanvas.width, h: imageCanvas.height });
  }

  clearPastedTexture(objId) {
    const { gl } = this;
    const entry = this._pastedTexCache.get(objId);
    if (entry) { gl.deleteTexture(entry.tex); this._pastedTexCache.delete(objId); }
  }

  // viz = { scale, param, min, max } — value→[0,1] warp for the active mode.
  setScene(planes, dist, fovArcsec, viz = {}, vizMode = 0, vizSrcIdx = -1, isDark = 1, saddlePhis = [], fermatBeta = [0, 0]) {
    this._scene = { planes, dist, fovArcsec, viz, vizMode, vizSrcIdx, isDark, saddlePhis, fermatBeta };
    this._draw();
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r   = this.canvas.getBoundingClientRect();
    const w   = Math.max(1, Math.round(r.width  * dpr));
    const h   = Math.max(1, Math.round(r.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width  = w;
    this.canvas.height = h;
    if (this._scene) this._draw();
  }

  destroy() {
    const { gl } = this;
    gl.deleteProgram(this._prog);
    gl.deleteBuffer(this._quad);
    for (const { tex } of this._pastedTexCache.values()) gl.deleteTexture(tex);
    gl.deleteTexture(this._dummyTex);
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  _draw() {
    const { gl, _prog, _locs } = this;
    const { planes, dist, fovArcsec, viz, vizMode, vizSrcIdx, isDark, saddlePhis, fermatBeta } = this._scene;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(_prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(_locs.a_pos);
    gl.vertexAttribPointer(_locs.a_pos, 2, gl.FLOAT, false, 0, 0);

    const _viz = viz ?? {};
    gl.uniform1f(_locs.u_fov, fovArcsec);
    gl.uniform2f(_locs.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1i(_locs.u_vizScale,      _viz.scale ?? 1);
    gl.uniform1f(_locs.u_vizScaleParam, _viz.param ?? 0.5);
    gl.uniform1f(_locs.u_vizMin,        _viz.min   ?? 0.0);
    gl.uniform1f(_locs.u_vizMax,        _viz.max   ?? 1.0);
    gl.uniform1i(_locs.u_colormap,      _viz.palette ?? 0);
    gl.uniform1i(_locs.u_vizMode,      vizMode   ?? 0);
    gl.uniform1i(_locs.u_vizSrcIdx,    vizSrcIdx ?? -1);
    gl.uniform1i(_locs.u_isDark,       isDark    ?? 1);

    const _saddles = saddlePhis ?? [];
    const _saddleArr = new Float32Array(8);
    for (let i = 0; i < Math.min(_saddles.length, 8); i++) _saddleArr[i] = _saddles[i];
    gl.uniform1fv(_locs.u_saddlePhi, _saddleArr);
    gl.uniform1i (_locs.u_nSaddle,   Math.min(_saddles.length, 8));
    const _fb = fermatBeta ?? [0, 0];
    gl.uniform2f(_locs.u_fermatBeta, _fb[0] ?? 0, _fb[1] ?? 0);

    const allPlanes = [...planes].sort((a, b) => a.z - b.z);
    const N = Math.min(allPlanes.length, MAX_PLANES);
    gl.uniform1i(_locs.u_numPlanes, N);

    const planeType = new Int32Array(MAX_PLANES);
    for (let i = 0; i < N; i++)
      planeType[i] = allPlanes[i].objects.some(o => !o.hidden && o.type === 'lens') ? 0 : 1;
    gl.uniform1iv(_locs.u_planeType, planeType);

    const D_obs  = new Float32Array(MAX_PLANES);
    const D_btwn = new Float32Array(MAX_PLANES * MAX_PLANES);
    for (let i = 0; i < N; i++) {
      D_obs[i] = dist.D_obs[i] || 0;
      for (let j = 0; j < N; j++) D_btwn[i * MAX_PLANES + j] = dist.D_btwn[i * dist.N + j] || 0;
    }
    gl.uniform1fv(_locs.u_D_obs,  D_obs);
    gl.uniform1fv(_locs.u_D_btwn, D_btwn);

    const chi = new Float32Array(MAX_PLANES);
    for (let i = 0; i < N; i++) chi[i] = (1 + allPlanes[i].z) * (dist.D_obs[i] || 0);
    gl.uniform1fv(_locs.u_chi, chi);

    // Pack lens objects.
    const lensModel    = new Int32Array(MAX_OBJECTS);
    const lensPlaneIdx = new Int32Array(MAX_OBJECTS);
    const lensCenter   = new Float32Array(MAX_OBJECTS * 2);
    const lensParams   = new Float32Array(MAX_OBJECTS * 4);
    let li = 0;
    for (let pi = 0; pi < N && li < MAX_OBJECTS; pi++) {
      for (const obj of allPlanes[pi].objects) {
        if (li >= MAX_OBJECTS) break;
        if (obj.hidden || obj.type !== 'lens') continue;
        lensPlaneIdx[li]     = pi;
        lensCenter[li * 2]   = obj.cx;
        lensCenter[li * 2+1] = obj.cy;
        const mp = _modelParams(obj);
        lensModel[li]        = mp.model;
        lensParams[li * 4]   = mp.p0;
        lensParams[li * 4+1] = mp.p1;
        lensParams[li * 4+2] = mp.p2;
        lensParams[li * 4+3] = mp.p3;
        li++;
      }
    }
    gl.uniform1i (_locs.u_numLenses,    li);
    gl.uniform1iv(_locs.u_lensModel,    lensModel);
    gl.uniform1iv(_locs.u_lensPlaneIdx, lensPlaneIdx);
    gl.uniform2fv(_locs.u_lensCenter,   lensCenter);
    gl.uniform4fv(_locs.u_lensParams,   lensParams);

    // Pack source objects.
    const srcModel    = new Int32Array(MAX_OBJECTS);
    const srcPlaneIdx = new Int32Array(MAX_OBJECTS);
    const srcCenter   = new Float32Array(MAX_OBJECTS * 2);
    const srcParams   = new Float32Array(MAX_OBJECTS * 4);
    const srcColor    = new Float32Array(MAX_OBJECTS * 3).fill(1); // default white
    const pastedSlot  = new Int32Array(MAX_OBJECTS).fill(-1);
    // Texture slots: collect up to MAX_PASTED pasted-image sources.
    const slotEntries = [null, null, null, null]; // { tex, w, h } per slot
    let pastedCount = 0;
    let si = 0;

    for (let pi = 0; pi < N && si < MAX_OBJECTS; pi++) {
      for (const obj of allPlanes[pi].objects) {
        if (si >= MAX_OBJECTS) break;
        if (obj.hidden || obj.type !== 'source') continue;
        srcPlaneIdx[si]     = pi;
        srcCenter[si * 2]   = obj.cx;
        srcCenter[si * 2+1] = obj.cy;
        srcModel[si]        = obj.model === 'exponential'  ? 1
                            : obj.model === 'pastedimage'  ? 3
                            : obj.model === 'point'        ? 4
                            : obj.model === 'pointsource'  ? 5 : 0;
        srcParams[si * 4]   = obj.params.sigma     ?? 0.3;
        srcParams[si * 4+1] = obj.params.q         ?? 1.0;
        srcParams[si * 4+2] = obj.params.phi       ?? 0.0;
        srcParams[si * 4+3] = obj.params.amplitude ?? 1.0;

        // Source tint color (analytical sources only).
        // params.color is stored as the dark-mode display value.
        // In light mode the CSS filter:invert(1) on the canvas automatically
        // inverts everything, so the stored value is passed to the shader as-is.
        if (obj.model !== 'pastedimage') {
          const hex = obj.params.color ?? '#ffffff';
          srcColor[si*3]   = parseInt(hex.slice(1,3), 16) / 255;
          srcColor[si*3+1] = parseInt(hex.slice(3,5), 16) / 255;
          srcColor[si*3+2] = parseInt(hex.slice(5,7), 16) / 255;
        }

        if (obj.model === 'pastedimage' && pastedCount < MAX_PASTED) {
          const slot = pastedCount++;
          pastedSlot[si]    = slot;
          const cached = this._pastedTexCache.get(obj.id) ?? null;
          slotEntries[slot] = cached ? { ...cached, scale: obj.params.sigma ?? 1.0 } : null;
        }
        si++;
      }
    }
    gl.uniform1i (_locs.u_numSources,   si);
    gl.uniform1iv(_locs.u_srcModel,     srcModel);
    gl.uniform1iv(_locs.u_srcPlaneIdx,  srcPlaneIdx);
    gl.uniform2fv(_locs.u_srcCenter,    srcCenter);
    gl.uniform4fv(_locs.u_srcParams,    srcParams);
    gl.uniform3fv(_locs.u_srcColor,     srcColor);
    gl.uniform1iv(_locs.u_pastedSlot,   pastedSlot);

    // Bind texture slots 0-3 and set size uniforms.
    const szLocs = [_locs.u_pastedSz0, _locs.u_pastedSz1, _locs.u_pastedSz2, _locs.u_pastedSz3];
    const txLocs = [_locs.u_pastedTex0, _locs.u_pastedTex1, _locs.u_pastedTex2, _locs.u_pastedTex3];
    for (let s = 0; s < MAX_PASTED; s++) {
      gl.activeTexture(gl.TEXTURE0 + s);
      const entry = slotEntries[s];
      gl.bindTexture(gl.TEXTURE_2D, entry ? entry.tex : this._dummyTex);
      gl.uniform1i(txLocs[s], s);
      const ar    = entry ? (entry.w / entry.h) : 1;
      const scale = entry ? (entry.scale ?? 1.0) : 1.0;
      const szH   = fovArcsec * 0.5 * scale;
      gl.uniform2f(szLocs[s], szH * ar, szH);
    }

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  _buildProgram(vertSrc, fragSrc) {
    const { gl } = this;
    const vert = this._compileShader(gl.VERTEX_SHADER,   vertSrc);
    const frag = this._compileShader(gl.FRAGMENT_SHADER, fragSrc);
    const prog = gl.createProgram();
    gl.attachShader(prog, vert); gl.attachShader(prog, frag);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error('Shader link error: ' + gl.getProgramInfoLog(prog));
    gl.deleteShader(vert); gl.deleteShader(frag);
    return prog;
  }

  _compileShader(type, src) {
    const { gl } = this;
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src); gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
      throw new Error('Shader compile error: ' + gl.getShaderInfoLog(sh));
    return sh;
  }

  _buildQuad() {
    const { gl } = this;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1,
    ]), gl.STATIC_DRAW);
    return buf;
  }

  _buildDummyTex() {
    const { gl } = this;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0,
                  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    return tex;
  }

  _getLocations() {
    const { gl, _prog: p } = this;
    const u = n => gl.getUniformLocation(p, n);
    const a = n => gl.getAttribLocation(p, n);
    return {
      a_pos:          a('a_pos'),
      u_fov:          u('u_fov'),
      u_res:          u('u_res'),
      u_vizScale:      u('u_vizScale'),
      u_vizScaleParam: u('u_vizScaleParam'),
      u_vizMin:        u('u_vizMin'),
      u_vizMax:        u('u_vizMax'),
      u_colormap:      u('u_colormap'),
      u_vizMode:      u('u_vizMode'),
      u_vizSrcIdx:    u('u_vizSrcIdx'),
      u_isDark:       u('u_isDark'),
      u_D_obs:        u('u_D_obs'),
      u_D_btwn:       u('u_D_btwn'),
      u_chi:          u('u_chi'),
      u_numPlanes:    u('u_numPlanes'),
      u_planeType:    u('u_planeType'),
      u_numLenses:    u('u_numLenses'),
      u_lensModel:    u('u_lensModel'),
      u_lensPlaneIdx: u('u_lensPlaneIdx'),
      u_lensCenter:   u('u_lensCenter'),
      u_lensParams:   u('u_lensParams'),
      u_numSources:   u('u_numSources'),
      u_srcModel:     u('u_srcModel'),
      u_srcPlaneIdx:  u('u_srcPlaneIdx'),
      u_srcCenter:    u('u_srcCenter'),
      u_srcParams:    u('u_srcParams'),
      u_srcColor:     u('u_srcColor'),
      u_pastedSlot:   u('u_pastedSlot'),
      u_pastedTex0:   u('u_pastedTex0'),
      u_pastedTex1:   u('u_pastedTex1'),
      u_pastedTex2:   u('u_pastedTex2'),
      u_pastedTex3:   u('u_pastedTex3'),
      u_pastedSz0:    u('u_pastedSz0'),
      u_pastedSz1:    u('u_pastedSz1'),
      u_pastedSz2:    u('u_pastedSz2'),
      u_pastedSz3:    u('u_pastedSz3'),
      u_saddlePhi:    u('u_saddlePhi'),
      u_nSaddle:      u('u_nSaddle'),
      u_fermatBeta:   u('u_fermatBeta'),
    };
  }
}

function _modelParams(obj) {
  const { model, params } = obj;
  if (model === 'pointmass') return { model:0, p0: params.thetaE??1, p1:0, p2:0, p3:0 };
  if (model === 'sie')       return { model:1, p0: params.b??1, p1: params.q??0.8, p2: params.phi??0, p3:0 };
  if (model === 'epl')       return { model:2, p0: params.b??1, p1: params.q??0.75, p2: params.phi??0, p3: params.gamma??2 };
  if (model === 'shear')       return { model:3, p0: params.gamma??0.05, p1: params.phi??0, p2:0, p3:0 };
  if (model === 'convergence') return { model:4, p0: params.kappa??0.05, p1:0, p2:0, p3:0 };
  if (model === 'deflection')  return { model:5, p0: params.alpha??0.1, p1: params.phi??0, p2:0, p3:0 };
  if (model === 'nie')         return { model:6, p0: params.b??1, p1: params.q??0.8, p2: params.phi??0, p3: params.rc??0.2 };
  return { model:0, p0:1, p1:0, p2:0, p3:0 };
}
