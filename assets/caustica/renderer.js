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
uniform int   u_toneMap;
uniform float u_toneMapParam;
uniform int   u_vizMode;      // 0=surface brightness, 1=κ, 2=γ, 3=|μ|, 4=signed μ, 5=|α|
uniform int   u_vizSrcIdx;    // target plane index for visualization Jacobian
uniform int   u_isDark;       // 1 = dark theme, 0 = light theme

uniform float u_D_obs [${MAX_PLANES}];
uniform float u_D_btwn[${MAX_PLANES * MAX_PLANES}];

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
  if (m == 3) return deflectShear(pos, p.x, p.y); // shear is relative to origin, not object centre
  if (m == 4) return p.x * pos;                                      // external convergence: kappa * theta
  if (m == 5) return vec2(p.x * cos(p.y), p.x * sin(p.y));          // constant deflection: alpha*(cos phi, sin phi)
  return vec2(0.0);
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
// Dark:  blue → very dark navy (neutral) → orange-red; avoids white.
vec3 cmDiverge(float t) {
  t = clamp(t, -1.0, 1.0);
  if (u_isDark == 1) {
    vec3 neg = vec3(0.25, 0.50, 1.00);
    vec3 ctr = vec3(0.07, 0.07, 0.14);
    vec3 pos = vec3(1.00, 0.35, 0.12);
    if (t < 0.0) return mix(ctr, neg, -t);
    else          return mix(ctr, pos,  t);
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

// ── Visualization Jacobian ────────────────────────────────────────────────────

vec3 computeViz(vec2 theta) {
  float h = u_fov * 0.004; // finite-difference step (~0.016" at fov=4)
  int tgt = u_vizSrcIdx;
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

  if (u_vizMode == 1) { // convergence κ: sequential, clamped ≥ 0, saturates at κ ≈ 2
    return cmSequential(max(kappa, 0.0) * 0.5);
  }
  if (u_vizMode == 2) { // shear |γ|: sequential, [0, 0.5]
    return cmSequential(gamma * 2.0);
  }
  if (u_vizMode == 3) { // |magnification| log scale
    float mu = 1.0 / max(abs(detJ), 0.001);
    return cmSequential(log2(mu + 1.0) / 5.0);
  }
  if (u_vizMode == 4) { // signed magnification: diverging
    float muS = clamp(1.0 / detJ, -8.0, 8.0);
    return cmDiverge(muS * 0.15);
  }
  // u_vizMode == 5: deflection |α|
  vec2 beta = (bpx + bmx) * 0.5; // ≈ traceToPlane(theta, tgt)
  float alpha_mag = length(theta - beta);
  return cmSequential(alpha_mag / (u_fov * 0.4));
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
  if (u_toneMap == 1) {
    colorOut = sqrt(colorOut);
  } else if (u_toneMap == 2) {
    colorOut = pow(colorOut, vec3(u_toneMapParam));
  } else if (u_toneMap == 3) {
    float a = max(u_toneMapParam, 0.01);
    colorOut = log(a * colorOut + sqrt(a * a * colorOut * colorOut + 1.0)) / log(a + sqrt(a * a + 1.0));
  }
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

  setScene(planes, dist, fovArcsec, toneMap = 1, toneMapParam = 0.5, vizMode = 0, vizSrcIdx = -1, isDark = 1) {
    this._scene = { planes, dist, fovArcsec, toneMap, toneMapParam, vizMode, vizSrcIdx, isDark };
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
    const { planes, dist, fovArcsec, toneMap, toneMapParam, vizMode, vizSrcIdx, isDark } = this._scene;

    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(_prog);

    gl.bindBuffer(gl.ARRAY_BUFFER, this._quad);
    gl.enableVertexAttribArray(_locs.a_pos);
    gl.vertexAttribPointer(_locs.a_pos, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(_locs.u_fov, fovArcsec);
    gl.uniform2f(_locs.u_res, this.canvas.width, this.canvas.height);
    gl.uniform1i(_locs.u_toneMap,      toneMap      ?? 1);
    gl.uniform1f(_locs.u_toneMapParam, toneMapParam ?? 0.5);
    gl.uniform1i(_locs.u_vizMode,      vizMode   ?? 0);
    gl.uniform1i(_locs.u_vizSrcIdx,    vizSrcIdx ?? -1);
    gl.uniform1i(_locs.u_isDark,       isDark    ?? 1);

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
      u_toneMap:      u('u_toneMap'),
      u_toneMapParam: u('u_toneMapParam'),
      u_vizMode:      u('u_vizMode'),
      u_vizSrcIdx:    u('u_vizSrcIdx'),
      u_isDark:       u('u_isDark'),
      u_D_obs:        u('u_D_obs'),
      u_D_btwn:       u('u_D_btwn'),
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
  return { model:0, p0:1, p1:0, p2:0, p3:0 };
}
