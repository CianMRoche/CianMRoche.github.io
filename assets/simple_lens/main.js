// simpleLens — main.js

import { Renderer }                            from './renderer.js';
import { precomputeDistances,
         computeCriticalCurves,
         angDiamDist,
         angDiamDistBetween }                  from './lens.js';

// ── ID generator ──────────────────────────────────────────────────────────────
let _nextId = 1;
function uid() { return _nextId++; }

// ── Type colors — lens = blue/cyan, source = amber ────────────────────────────
function typeColorHex(type) {
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (type === 'lens') return dark ? '#7bbfcc' : '#2563eb';
  return dark ? '#fbbf24' : '#f59e0b';
}

// ── Curve colors: not white, not the lens/source type colors ──────────────────
// Critical curves: hot pink; Caustics: lime green.
const CRIT_COLOR = 'rgba(248, 113, 196, 0.95)';
const CAUS_COLOR = 'rgba(134, 239, 172, 0.95)';

// ── App state ─────────────────────────────────────────────────────────────────
const state = {
  fov:             4.0,
  zMax:            3.0,
  planes:          [],
  selectedPlaneId: null,
  selectedObjId:   null,
  showCritCurves:  false,
  showCaustics:    false,
  showMarkers:     false,
  critGridN:       512,
  critZs:          null,  // null = auto (highest-z source plane)
  dist:            null,
};

function defaultParams(model) {
  if (model === 'pointmass')   return { thetaE: 1.0 };
  if (model === 'sie')         return { b: 1.0, q: 0.75, phi: 0 };
  if (model === 'nfw')         return { kappaS: 0.5, rS: 0.4 };
  if (model === 'gaussian')    return { sigma: 0.06, q: 1.0,  phi: 0, amplitude: 1.0 };
  if (model === 'exponential') return { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20 };
  if (model === 'pastedimage') return { amplitude: 1.0 };
  return {};
}

function makeObject(type, model, cx = 0, cy = 0) {
  return { id: uid(), model, cx, cy, params: defaultParams(model) };
}

function addPlane(z, type) {
  const model = type === 'lens' ? 'sie' : 'exponential';
  const plane = { id: uid(), z, type, objects: [makeObject(type, model)] };
  state.planes.push(plane);
  state.planes.sort((a, b) => a.z - b.z);
  invalidateDistances();
  return plane;
}

function removePlane(id) {
  state.planes = state.planes.filter(p => p.id !== id);
  if (state.selectedPlaneId === id) { state.selectedPlaneId = null; state.selectedObjId = null; }
  invalidateDistances();
}

function invalidateDistances() { state.dist = precomputeDistances(state.planes); }

function selectedPlane() { return state.planes.find(p => p.id === state.selectedPlaneId) ?? null; }
function selectedObj() {
  const pl = selectedPlane();
  return pl ? (pl.objects.find(o => o.id === state.selectedObjId) ?? null) : null;
}

// Pasted images are stored per-object on obj.pasteCanvas (HTMLCanvasElement|null).

// ── DOM refs ──────────────────────────────────────────────────────────────────
let renderer = null, glCanvas = null, overlayCtx = null;
let axisCanvas = null, planesEl = null, sidebarEl = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', init);

function init() {
  buildDOM();

  try {
    renderer = new Renderer(glCanvas);
  } catch (err) {
    console.error('simpleLens renderer init failed:', err);
    showRendererError(err.message);
  }

  loadDemoState();
  invalidateDistances();
  attachHandlers();
  rebuildPlaneBoxes();
  renderSidebar();

  requestAnimationFrame(() => { renderer?.resize(); redraw(); });

  new ResizeObserver(() => { renderer?.resize(); redraw(); })
    .observe(document.getElementById('sl-image-wrap'));
}

function applyThemeIcons(theme) {
  document.querySelectorAll('.icon-sun') .forEach(el => { el.style.display = theme === 'dark' ? 'block' : 'none'; });
  document.querySelectorAll('.icon-moon').forEach(el => { el.style.display = theme === 'dark' ? 'none'  : 'block'; });
}

function showRendererError(msg) {
  const wrap = document.getElementById('sl-image-wrap');
  if (wrap) wrap.innerHTML = `<div style="position:absolute;inset:0;display:flex;
    align-items:center;justify-content:center;padding:16px;font-size:13px;
    color:#f87171;text-align:center;background:#0d1117">
    WebGL2 required.<br><small style="opacity:.7">${msg}</small></div>`;
}

function loadDemoState() {
  const lp = addPlane(0.5, 'lens');
  lp.objects = [{ id: uid(), model: 'sie', cx: 0, cy: 0,
                  params: { b: 2.3, q: 0.75, phi: 0 } }];
  const sp = addPlane(1.0, 'source');
  sp.objects = [{ id: uid(), model: 'exponential', cx: 0.3, cy: 0.1,
                  params: { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20 } }];
}

// ── DOM ───────────────────────────────────────────────────────────────────────
function buildDOM() {
  document.getElementById('app').innerHTML = `
    <div class="app-inner">
      <div class="sl-topbar">
        <h1>simpleLens</h1>
        <a class="sl-back-btn" href="/side_projects/">← Side projects</a>
        <button class="sl-theme-btn" id="sl-theme" title="Toggle dark mode" aria-label="Toggle dark mode">
          <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
      </div>
      <div class="sl-body">
        <div class="sl-upper">
          <div class="sl-image-wrap" id="sl-image-wrap">
            <canvas id="sl-gl-canvas"></canvas>
            <canvas class="sl-overlay" id="sl-overlay"></canvas>
            <div class="sl-image-hint" id="sl-image-hint" style="display:none">
              Add a source plane to see lensing
            </div>
          </div>
          <div class="sl-sidebar">
            <div class="sl-params-col"   id="sl-params-col"></div>
            <div class="sl-settings-col" id="sl-settings-col"></div>
          </div>
        </div>
        <div class="sl-timeline">
          <div class="sl-axis-wrap">
            <div class="sl-axis-label">redshift z →</div>
            <canvas class="sl-axis-canvas" id="sl-axis-canvas"></canvas>
          </div>
          <div class="sl-planes" id="sl-planes"></div>
        </div>
      </div>
    </div>`;

  glCanvas   = document.getElementById('sl-gl-canvas');
  axisCanvas = document.getElementById('sl-axis-canvas');
  planesEl   = document.getElementById('sl-planes');
  // sidebarEl no longer used — renderSidebar targets sl-params-col / sl-settings-col directly.
  overlayCtx = document.getElementById('sl-overlay').getContext('2d');
}

// ── Handlers ──────────────────────────────────────────────────────────────────
function attachHandlers() {
  document.getElementById('sl-theme').addEventListener('click', () => {
    const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    applyThemeIcons(next);
    rebuildPlaneBoxes(); redraw();
  });
  applyThemeIcons(document.documentElement.getAttribute('data-theme') || 'dark');

  // Critical curve toggles are wired inside renderSidebar.

  attachAxisHandlers();

  // Paste image from clipboard — applies to the currently selected pastedimage object.
  document.addEventListener('paste', e => {
    const obj = selectedObj();
    if (!obj || obj.model !== 'pastedimage') return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const cvs = document.createElement('canvas');
        cvs.width  = img.naturalWidth  || img.width;
        cvs.height = img.naturalHeight || img.height;
        cvs.getContext('2d').drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        obj.pasteCanvas = cvs;
        renderer?.setPastedTexture(obj.id, cvs);
        rebuildPlaneBoxes();
        renderSidebar();
        redraw();
      };
      img.src = url;
      break;
    }
  });

  // Global keyboard: Delete/Backspace removes selected object; Esc deselects.
  document.addEventListener('keydown', e => {
    const tag  = (document.activeElement?.tagName) || '';
    const type = (document.activeElement?.type)    || '';
    if ((tag === 'INPUT' && type !== 'checkbox') || tag === 'TEXTAREA') return;
    if (e.key === 'Escape') {
      state.selectedObjId = null;
      renderSidebar(); rebuildPlaneBoxes();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const pl = selectedPlane();
      if (!pl) return;
      const toDelete = pl.objects.find(o => o.id === state.selectedObjId);
      if (toDelete?.model === 'pastedimage') renderer?.clearPastedTexture(toDelete.id);
      pl.objects = pl.objects.filter(o => o.id !== state.selectedObjId);
      state.selectedObjId = pl.objects[0]?.id ?? null;
      renderSidebar(); rebuildPlaneBoxes(); redraw();
    }
  });
}

// ── Axis interaction ───────────────────────────────────────────────────────────
const AXIS_HIT_PX = 12;

function axisZToX(z, Wl) {
  const PAD = 12;
  return PAD + (z / state.zMax) * (Wl - 2 * PAD);
}
function axisXToZ(x, Wl) {
  const PAD = 12;
  return Math.max(0.01, Math.min(state.zMax, ((x - PAD) / (Wl - 2 * PAD)) * state.zMax));
}

function attachAxisHandlers() {
  let dragPlane = null, didDrag = false;

  function nearestMarker(clientX) {
    const r  = axisCanvas.getBoundingClientRect();
    const x  = clientX - r.left;
    return state.planes.find(p => Math.abs(axisZToX(p.z, r.width) - x) < AXIS_HIT_PX) ?? null;
  }

  axisCanvas.addEventListener('pointermove', e => {
    if (dragPlane) {
      // Cursor locked to grabbing during drag.
      axisCanvas.style.cursor = 'grabbing';
      didDrag = true;
      const r = axisCanvas.getBoundingClientRect();
      const z = Math.round(axisXToZ(e.clientX - r.left, r.width) * 100) / 100;
      dragPlane.z = z;
      state.planes.sort((a, b) => a.z - b.z);
      invalidateDistances();
      rebuildPlaneBoxes(); drawAxisCanvas(); redraw();
    } else {
      axisCanvas.style.cursor = nearestMarker(e.clientX) ? 'grab' : 'crosshair';
    }
  });

  axisCanvas.addEventListener('pointerleave', () => { axisCanvas.style.cursor = 'crosshair'; });

  axisCanvas.addEventListener('pointerdown', e => {
    axisCanvas.setPointerCapture(e.pointerId);
    didDrag = false;
    dragPlane = nearestMarker(e.clientX);
    if (dragPlane) {
      axisCanvas.style.cursor = 'grabbing';
      state.selectedPlaneId = dragPlane.id;
      state.selectedObjId   = dragPlane.objects[0]?.id ?? null;
      renderSidebar();
    }
  });

  axisCanvas.addEventListener('pointerup', e => {
    if (!dragPlane && !didDrag) {
      const r    = axisCanvas.getBoundingClientRect();
      const z    = Math.round(axisXToZ(e.clientX - r.left, r.width) * 100) / 100;
      const type = state.planes.some(p => p.type === 'lens') && !state.planes.some(p => p.type === 'source')
        ? 'source' : 'lens';
      const pl = addPlane(z, type);
      state.selectedPlaneId = pl.id;
      state.selectedObjId   = pl.objects[0]?.id ?? null;
      rebuildPlaneBoxes(); renderSidebar(); redraw();
    }
    dragPlane = null;
    axisCanvas.style.cursor = nearestMarker(e.clientX) ? 'grab' : 'crosshair';
  });
}

// ── Plane boxes ───────────────────────────────────────────────────────────────
function rebuildPlaneBoxes() {
  planesEl.innerHTML = '';
  if (state.planes.length === 0) {
    planesEl.innerHTML = '<span class="sl-timeline-hint">Click the axis to add a lens or source plane</span>';
    return;
  }

  for (const plane of state.planes) {
    const color     = typeColorHex(plane.type);
    const lensAct   = plane.type === 'lens'   ? ' active' : '';
    const srcAct    = plane.type === 'source' ? ' active' : '';
    const box       = document.createElement('div');
    box.className   = 'sl-plane-box';
    box.dataset.id  = plane.id;
    box.dataset.type = plane.type;
    box.style.setProperty('--plane-color', color);

    box.innerHTML = `
      <div class="sl-plane-header">
        <span class="sl-plane-z">z = ${plane.z.toFixed(2)}</span>
        <button class="sl-plane-type-btn${lensAct}" data-type="lens">Lens</button>
        <button class="sl-plane-type-btn${srcAct}"  data-type="source">Src</button>
        <button class="sl-plane-del" title="Delete plane">×</button>
      </div>
      <canvas class="sl-plane-canvas" width="148" height="148"></canvas>`;

    planesEl.appendChild(box);

    // Type buttons.
    box.querySelectorAll('.sl-plane-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        plane.type = btn.dataset.type;
        const model = plane.type === 'lens' ? 'sie' : 'exponential';
        plane.objects = [makeObject(plane.type, model)];
        state.selectedPlaneId = plane.id;
        state.selectedObjId   = plane.objects[0].id;
        invalidateDistances();
        rebuildPlaneBoxes(); renderSidebar(); redraw();
      });
    });

    // Delete.
    box.querySelector('.sl-plane-del').addEventListener('click', () => {
      removePlane(plane.id); rebuildPlaneBoxes(); renderSidebar(); redraw();
    });

    const cvs = box.querySelector('.sl-plane-canvas');
    attachPlaneCanvasHandlers(cvs, plane);
    drawPlaneCanvas(cvs, plane);
  }
}

// ── Plane canvas interaction ───────────────────────────────────────────────────
const HIT_R = 10; // px

function attachPlaneCanvasHandlers(canvas, plane) {
  // 'idle' | 'hit-pending' | 'dragging' | 'add-pending' | 'add-dragging'
  let istate  = 'idle';
  let hitObj  = null;
  let pStart  = null; // { cx, cy, mx, my } for dragging
  const DRAG_THRESH = 3; // px

  canvas.addEventListener('pointermove', e => {
    if (istate === 'idle') {
      canvas.style.cursor = hitTestPlane(plane, canvas, e) ? 'grab' : 'crosshair';
      return;
    }
    const pos = canvasToArcsec(canvas, e);
    const dx  = pos.x - pStart.mx, dy = pos.y - pStart.my;
    const dpx = dx / state.fov * canvas.offsetWidth;

    if (istate === 'hit-pending' && Math.hypot(dpx, dy / state.fov * canvas.offsetHeight) > DRAG_THRESH) {
      istate = 'dragging'; canvas.style.cursor = 'grabbing';
    }
    if (istate === 'add-pending' && Math.hypot(dpx, dy / state.fov * canvas.offsetHeight) > DRAG_THRESH) {
      const model = plane.type === 'lens' ? 'sie' : 'gaussian';
      hitObj = makeObject(plane.type, model, pStart.mx, pStart.my);
      plane.objects.push(hitObj);
      state.selectedPlaneId = plane.id;
      state.selectedObjId   = hitObj.id;
      pStart.cx = pStart.mx; pStart.cy = pStart.my;
      istate = 'add-dragging'; canvas.style.cursor = 'grabbing';
      renderSidebar();
    }
    if (istate === 'dragging' || istate === 'add-dragging') {
      hitObj.cx = pStart.cx + dx;
      hitObj.cy = pStart.cy + dy;
      redrawPlaneCanvas(plane); redraw();
    }
  });

  canvas.addEventListener('pointerleave', () => { if (istate === 'idle') canvas.style.cursor = 'crosshair'; });

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const pos = canvasToArcsec(canvas, e);
    hitObj     = hitTestPlane(plane, canvas, e);
    if (hitObj) {
      istate = 'hit-pending'; canvas.style.cursor = 'grab';
      pStart = { cx: hitObj.cx, cy: hitObj.cy, mx: pos.x, my: pos.y };
      state.selectedPlaneId = plane.id;
      state.selectedObjId   = hitObj.id;
      redrawPlaneCanvas(plane); renderSidebar();
    } else {
      istate = 'add-pending';
      pStart = { mx: pos.x, my: pos.y };
    }
  });

  canvas.addEventListener('pointerup', e => {
    if (istate === 'add-pending') {
      // Clean click on empty space → add object here.
      const pos   = canvasToArcsec(canvas, e);
      const model = plane.type === 'lens' ? 'sie' : 'gaussian';
      const obj   = makeObject(plane.type, model, pos.x, pos.y);
      plane.objects.push(obj);
      state.selectedPlaneId = plane.id;
      state.selectedObjId   = obj.id;
      redrawPlaneCanvas(plane); renderSidebar(); redraw();
    } else if (istate === 'dragging' || istate === 'add-dragging') {
      invalidateDistances(); redraw();
    }
    istate = 'idle'; hitObj = null;
    canvas.style.cursor = hitTestPlane(plane, canvas, e) ? 'grab' : 'crosshair';
  });
}

function canvasToArcsec(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return {
    x:  (e.clientX - r.left) / r.width  * state.fov - state.fov / 2,
    y: -((e.clientY - r.top) / r.height * state.fov - state.fov / 2),
  };
}

function hitTestPlane(plane, canvas, e) {
  const r = canvas.getBoundingClientRect();
  for (const obj of plane.objects) {
    const px = (obj.cx / state.fov + 0.5) * r.width;
    const py = (-obj.cy / state.fov + 0.5) * r.height;
    if (Math.hypot(e.clientX - r.left - px, e.clientY - r.top - py) < HIT_R) return obj;
  }
  return null;
}

function redrawPlaneCanvas(plane) {
  const cvs = planesEl.querySelector(`.sl-plane-canvas[data-id="${plane.id}"], .sl-plane-box[data-id="${plane.id}"] .sl-plane-canvas`);
  if (cvs) drawPlaneCanvas(cvs, plane);
}

function drawPlaneCanvas(canvas, plane) {
  const ctx   = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const dark  = document.documentElement.getAttribute('data-theme') === 'dark';
  const color = typeColorHex(plane.type);

  ctx.fillStyle = dark ? '#0d1117' : '#f9fafb';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = dark ? '#30363d' : '#e5e7eb';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(W/2,0); ctx.lineTo(W/2,H);
  ctx.moveTo(0,H/2); ctx.lineTo(W,H/2);
  ctx.stroke();

  // Draw pasted-image thumbnails behind their dots.
  for (const obj of plane.objects) {
    if (obj.model !== 'pastedimage') continue;
    if (obj.pasteCanvas) {
      ctx.globalAlpha = 0.55;
      ctx.drawImage(obj.pasteCanvas, 0, 0, W, H);
      ctx.globalAlpha = 1;
    }
  }

  for (const obj of plane.objects) {
    const px  = (obj.cx / state.fov + 0.5) * W;
    const py  = (-obj.cy / state.fov + 0.5) * H;
    const sel = obj.id === state.selectedObjId && plane.id === state.selectedPlaneId;
    const rad = 6;
    ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = sel ? 1 : 0.7;
    ctx.fill();
    ctx.globalAlpha = 1;
    if (sel) {
      ctx.beginPath(); ctx.arc(px, py, rad + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
const LENS_INFO = {
  sie: `<b>b</b> — Einstein radius (arcsec): overall lensing strength.<br>
        <b>q</b> — Axis ratio: 1 = circular, lower = more elliptical.<br>
        <b>φ</b> — Position angle of the major axis (radians).`,
  pointmass: `<b>θ<sub>E</sub></b> — Einstein radius (arcsec): angular radius of the Einstein ring for a source directly behind the lens.`,
  nfw: `<b>κ<sub>s</sub></b> — Central convergence amplitude: sets the overall mass scale.<br>
        <b>r<sub>s</sub></b> — Scale radius (arcsec): where the NFW profile transitions from ρ∝r⁻¹ to ρ∝r⁻³.`,
};
const SOURCE_INFO = `
  <b>σ</b> — Source size (arcsec): 1σ half-width of the brightness profile.<br>
  <b>q</b> — Axis ratio: 1 = circular, lower = more elliptical.<br>
  <b>φ</b> — Position angle of the major axis (radians).<br>
  <b>Amplitude</b> — Peak surface brightness.`;

function infoSection(id, html) {
  return `<details class="sl-info-details" id="${id}">
    <summary class="sl-info-btn">ⓘ</summary>
    <div class="sl-info-content">${html}</div>
  </details>`;
}

const SEL = s => `style="font-size:12px;padding:2px 6px;border:1px solid var(--hairline);border-radius:4px;background:var(--bg);color:var(--fg);cursor:pointer;${s||''}"`;

function renderSidebar() {
  const obj = selectedObj(), pl = selectedPlane();
  const ezs = effectiveCritZs();

  const globalPanel = `
    <div class="sl-panel">
      <div class="sl-panel-title">Global Settings</div>
      <div class="sl-global-input">
        <label>Field of view</label>
        <input type="number" id="sl-fov" min="0.5" max="20" step="0.5" value="${state.fov}">
        <span class="sl-unit">"</span>
      </div>
      <div class="sl-global-input">
        <label>z max</label>
        <input type="number" id="sl-zmax" min="0.1" max="10" step="0.1" value="${state.zMax}">
      </div>
      <div class="sl-checkbox-row">
        <label><input type="checkbox" id="sl-show-markers" ${state.showMarkers?'checked':''}> Show source/lens positions</label>
      </div>
    </div>`;

  const critPanel = `
    <div class="sl-panel">
      <div class="sl-panel-title">Critical Curves</div>
      <p class="sl-perf-note">(Can be slow at high resolutions)</p>
      <div class="sl-checkbox-row">
        <label><input type="checkbox" id="sl-show-crit" ${state.showCritCurves?'checked':''}> Show critical curves</label>
        <label><input type="checkbox" id="sl-show-caus" ${state.showCaustics   ?'checked':''}> Show caustics</label>
      </div>
      <div class="sl-global-input">
        <label>Resolution</label>
        <select id="sl-crit-res">
          <option value="256"  ${state.critGridN===256  ?'selected':''}>Low (256)</option>
          <option value="512"  ${state.critGridN===512  ?'selected':''}>Medium (512)</option>
          <option value="1024" ${state.critGridN===1024 ?'selected':''}>High (1024)</option>
          <option value="2048" ${state.critGridN===2048 ?'selected':''}>Very high (2048)</option>
        </select>
      </div>
      <div class="sl-global-input">
        <label>Source z<sub>s</sub></label>
        <input type="number" id="sl-crit-zs" min="0.1" max="15" step="0.1" value="${ezs.toFixed(2)}">
      </div>
    </div>`;

  let paramsPanel = '';
  if (obj && pl) {
    const isLens = pl.type === 'lens';
    // NFW disabled — critical curve computation has known issues with this model.
    const modelOptions = isLens
      ? `<option value="sie"       ${obj.model==='sie'       ?'selected':''}>SIE (Isothermal ellipsoid)</option>
         <option value="pointmass" ${obj.model==='pointmass' ?'selected':''}>Point mass</option>`
      : `<option value="gaussian"    ${obj.model==='gaussian'    ?'selected':''}>Gaussian</option>
         <option value="exponential" ${obj.model==='exponential' ?'selected':''}>Exponential</option>
         <option value="pastedimage" ${obj.model==='pastedimage' ?'selected':''}>Pasted image</option>`;

    const infoHtml = isLens
      ? infoSection('sl-param-info', LENS_INFO[obj.model] ?? '')
      : infoSection('sl-param-info', SOURCE_INFO);

    paramsPanel = `
      <div class="sl-panel">
        <div class="sl-panel-title-row">
          <span class="sl-panel-title">${isLens ? 'Lens' : 'Source'} (z=${pl.z.toFixed(2)})</span>
          ${infoHtml}
        </div>
        <select class="sl-select" id="sl-model-select">${modelOptions}</select>
        ${isLens ? lensParamRows(obj) : sourceParamRows(obj)}
      </div>`;
  } else {
    paramsPanel = `<div class="sl-panel"><div class="sl-empty-msg">Click an object in a plane box to edit its parameters.</div></div>`;
  }

  // Params column: context-sensitive (nearest the image).
  document.getElementById('sl-params-col').innerHTML = paramsPanel;
  // Settings column: global controls + critical curves (less frequently changed).
  document.getElementById('sl-settings-col').innerHTML = globalPanel + critPanel;

  document.getElementById('sl-fov')?.addEventListener('change',      e => { const v = parseFloat(e.target.value); if (v > 0) { state.fov  = v; redraw(); } });
  document.getElementById('sl-zmax')?.addEventListener('change',     e => { const v = parseFloat(e.target.value); if (v > 0) { state.zMax = v; drawAxisCanvas(); } });
  document.getElementById('sl-show-markers')?.addEventListener('change', e => { state.showMarkers    = e.target.checked; redraw(); });
  document.getElementById('sl-crit-res')?.addEventListener('change', e => { state.critGridN = parseInt(e.target.value, 10); redraw(); });
  document.getElementById('sl-crit-zs')?.addEventListener('change',  e => { const v = parseFloat(e.target.value); if (v > 0) { state.critZs = v; redraw(); } });
  document.getElementById('sl-show-crit')?.addEventListener('change', e => { state.showCritCurves = e.target.checked; redraw(); });
  document.getElementById('sl-show-caus')?.addEventListener('change', e => { state.showCaustics   = e.target.checked; redraw(); });

  if (obj && pl) {
    document.getElementById('sl-model-select')?.addEventListener('change', e => {
      obj.model = e.target.value; obj.params = defaultParams(obj.model);
      renderSidebar(); redraw();
    });
    document.getElementById('sl-params-col').querySelectorAll('input[type="range"][data-param]').forEach(inp => {
      const valEl = inp.parentElement.querySelector('.sl-param-val');
      inp.addEventListener('input', () => {
        obj.params[inp.dataset.param] = parseFloat(inp.value);
        if (valEl) valEl.textContent = fmtP(parseFloat(inp.value));
        redraw();
      });
    });
  }
}

function fmtP(v) { return v.toFixed(2); }

function sliderRow(label, key, min, max, step, val) {
  return `<div class="sl-param-row">
    <span class="sl-param-label">${label}</span>
    <input type="range" data-param="${key}" min="${min}" max="${max}" step="${step}" value="${val}">
    <span class="sl-param-val">${fmtP(val)}</span>
  </div>`;
}

function lensParamRows(obj) {
  const p = obj.params;
  if (obj.model === 'pointmass')
    return sliderRow('θ<sub>E</sub> (")', 'thetaE', 0.1, 3.0, 0.05, p.thetaE ?? 1);
  if (obj.model === 'sie')
    return sliderRow('b (")',          'b',   0.1, 3.0,      0.05, p.b      ?? 1)
         + sliderRow('q',              'q',   0.1, 1.0,      0.05, p.q      ?? 0.75)
         + sliderRow('φ (rad)',        'phi', 0,   Math.PI,  0.05, p.phi    ?? 0);
  if (obj.model === 'nfw')
    return sliderRow('κ<sub>s</sub>',      'kappaS', 0.05, 3.0, 0.05, p.kappaS ?? 0.5)
         + sliderRow('r<sub>s</sub> (")', 'rS',     0.05, 2.0, 0.05, p.rS     ?? 0.4);
  return '';
}

function sourceParamRows(obj) {
  const p = obj.params;
  if (obj.model === 'pastedimage') {
    const hint = obj.pasteCanvas ? '' :
      '<p style="font-size:11px;color:var(--muted);font-style:italic;margin-top:6px">Select this point, then Ctrl+V to paste an image</p>';
    return sliderRow('Brightness', 'amplitude', 0.1, 5.0, 0.1, p.amplitude ?? 1.0) + hint;
  }
  return sliderRow('σ (")',      'sigma',     0.005, 0.5, 0.005, p.sigma   ?? 0.06)
       + sliderRow('q',          'q',         0.1,  1.0, 0.05, p.q         ?? 1.0)
       + sliderRow('φ (rad)',    'phi',        0, Math.PI, 0.05, p.phi      ?? 0)
       + sliderRow('A',         'amplitude',  0.1,  3.0, 0.1,  p.amplitude ?? 1.0);
}

// ── Axis canvas ───────────────────────────────────────────────────────────────
function drawAxisCanvas() {
  if (!axisCanvas) return;
  const dpr = window.devicePixelRatio || 1;
  const r   = axisCanvas.getBoundingClientRect();
  const W   = Math.max(1, Math.round(r.width * dpr));
  const H   = Math.max(1, Math.round(r.height * dpr));
  if (axisCanvas.width !== W || axisCanvas.height !== H) { axisCanvas.width = W; axisCanvas.height = H; }

  const ctx  = axisCanvas.getContext('2d');
  const dark = document.documentElement.getAttribute('data-theme') === 'dark';
  ctx.clearRect(0, 0, W, H);
  ctx.save(); ctx.scale(dpr, dpr);

  const Wl = W/dpr, Hl = H/dpr;
  const PAD = 12, axisY = Hl * 0.55;

  ctx.strokeStyle = dark ? '#30363d' : '#e5e7eb';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(PAD, axisY); ctx.lineTo(Wl-PAD, axisY); ctx.stroke();

  ctx.font = '10px system-ui, sans-serif'; ctx.textAlign = 'center';
  for (const z of [0, 0.5, 1, 1.5, 2, 2.5, 3, 4, 5].filter(z => z <= state.zMax)) {
    const x = axisZToX(z, Wl);
    ctx.strokeStyle = dark ? '#30363d' : '#e5e7eb'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, axisY-4); ctx.lineTo(x, axisY+4); ctx.stroke();
    ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
    ctx.fillText(String(z), x, axisY + 15);
  }

  for (const plane of state.planes) {
    const x    = axisZToX(plane.z, Wl);
    const col  = typeColorHex(plane.type);
    const sel  = plane.id === state.selectedPlaneId;
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, axisY-12); ctx.lineTo(x, axisY+4); ctx.stroke();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.moveTo(x, axisY-18); ctx.lineTo(x+5, axisY-12);
    ctx.lineTo(x, axisY-6); ctx.lineTo(x-5, axisY-12); ctx.closePath(); ctx.fill();
    ctx.font = '9.5px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(plane.z.toFixed(2), x, axisY-22);
    ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(plane.type === 'lens' ? 'L' : 'S', x, axisY+26);
  }

  // Hint text — bottom centre of the axis strip.
  ctx.font          = '10.5px system-ui, sans-serif';
  ctx.textAlign     = 'center';
  ctx.textBaseline  = 'bottom';
  ctx.fillStyle     = dark ? '#8b949e' : '#6b7280';
  ctx.fillText('Click to add a lens or source plane', Wl / 2, Hl - 4);

  ctx.restore();
}

// ── Critical curve helpers ─────────────────────────────────────────────────────

function effectiveCritZs() {
  if (state.critZs !== null) return state.critZs;
  const sources = state.planes.filter(p => p.type === 'source');
  return sources.length > 0 ? Math.max(...sources.map(p => p.z)) : 2.0;
}

// Compute critical curves for an arbitrary z_s (inserts a virtual source plane
// if no existing source plane sits at that redshift).
function computeCritCurvesForZs(planes, dist, zs, fovArcsec, gridN) {
  const sorted = [...planes].sort((a, b) => a.z - b.z);
  // Look for a source plane already at zs.
  let idx = sorted.findIndex(p => p.type === 'source' && Math.abs(p.z - zs) < 0.005);
  if (idx >= 0) return computeCriticalCurves(sorted, dist, idx, fovArcsec, gridN);
  // Insert a virtual (empty) source plane at zs and recompute distances.
  const vp       = { id: -1, z: zs, type: 'source', objects: [] };
  const augmented = [...sorted, vp].sort((a, b) => a.z - b.z);
  const augDist   = precomputeDistances(augmented);
  const augIdx    = augmented.indexOf(vp);
  return computeCriticalCurves(augmented, augDist, augIdx, fovArcsec, gridN);
}

// ── Overlay: critical curves, caustics, position markers, legend ──────────────
function drawOverlay() {
  const overlay = document.getElementById('sl-overlay');
  const r   = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const W   = Math.max(1, Math.round(r.width  * dpr));
  const H   = Math.max(1, Math.round(r.height * dpr));
  if (overlay.width !== W || overlay.height !== H) { overlay.width = W; overlay.height = H; }
  overlayCtx.clearRect(0, 0, W, H);

  const hasLens   = state.planes.some(p => p.type === 'lens');
  const needCurve = (state.showCritCurves || state.showCaustics) && state.dist && hasLens;
  if (!needCurve && !state.showMarkers) return;

  const Wl = W/dpr, Hl = H/dpr;
  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);

  function toPixel(ax, ay) {
    return [(ax / state.fov + 0.5) * Wl, (-ay / state.fov + 0.5) * Hl];
  }

  // ── 1. Position markers — same style as the plane-view canvases ─────────────
  if (state.showMarkers) {
    const RAD = 6;
    for (const plane of state.planes) {
      const col = typeColorHex(plane.type);
      for (const obj of plane.objects) {
        const [px, py] = toPixel(obj.cx, obj.cy);
        const sel = obj.id === state.selectedObjId && plane.id === state.selectedPlaneId;
        overlayCtx.beginPath();
        overlayCtx.arc(px, py, RAD, 0, Math.PI * 2);
        overlayCtx.fillStyle  = col;
        overlayCtx.globalAlpha = sel ? 1 : 0.7;
        overlayCtx.fill();
        overlayCtx.globalAlpha = 1;
        if (sel) {
          overlayCtx.beginPath();
          overlayCtx.arc(px, py, RAD + 3.5, 0, Math.PI * 2);
          overlayCtx.strokeStyle = col;
          overlayCtx.lineWidth   = 1.5;
          overlayCtx.stroke();
        }
      }
    }
  }

  // ── 2. Critical curves / caustics ────────────────────────────────────────────
  let critSegs = [], causSegs = [];
  if (needCurve) {
    const res = computeCritCurvesForZs(
      state.planes, state.dist, effectiveCritZs(), state.fov, state.critGridN
    );
    critSegs = res.critSegments;
    causSegs = res.causticSegments;

    overlayCtx.lineWidth = 1.3;
    function drawSegs(segs, color) {
      overlayCtx.strokeStyle = color;
      for (const [[x0,y0],[x1,y1]] of segs) {
        overlayCtx.beginPath();
        const [px0,py0] = toPixel(x0, y0), [px1,py1] = toPixel(x1, y1);
        overlayCtx.moveTo(px0, py0); overlayCtx.lineTo(px1, py1);
        overlayCtx.stroke();
      }
    }
    if (state.showCritCurves) drawSegs(critSegs,  CRIT_COLOR);
    if (state.showCaustics)   drawSegs(causSegs,   CAUS_COLOR);
  }

  // ── 3. Legend (top-left) ─────────────────────────────────────────────────────
  const legendItems = [];
  if (state.showCritCurves && hasLens) legendItems.push({ color: CRIT_COLOR, label: 'Critical curves', isLine: true });
  if (state.showCaustics   && hasLens) legendItems.push({ color: CAUS_COLOR, label: 'Caustics',        isLine: true });
  if (state.showMarkers && state.planes.some(p => p.type === 'lens'))
    legendItems.push({ color: typeColorHex('lens'),   label: 'Lens position',   isDot: true });
  if (state.showMarkers && state.planes.some(p => p.type === 'source'))
    legendItems.push({ color: typeColorHex('source'), label: 'Source position', isDot: true });

  if (legendItems.length > 0) {
    const lx = 8, ly = 8;
    const lineH = 28, padV = 11, padH = 14;
    const boxW  = 220, boxH = legendItems.length * lineH + 2 * padV;
    overlayCtx.fillStyle = 'rgba(0,0,0,0.58)';
    overlayCtx.fillRect(lx, ly, boxW, boxH);

    overlayCtx.font         = '18px system-ui, -apple-system, sans-serif';
    overlayCtx.textBaseline = 'middle';
    overlayCtx.textAlign    = 'left';

    legendItems.forEach((item, i) => {
      const iy = ly + padV + i * lineH + lineH / 2;
      const ix = lx + padH;
      if (item.isLine) {
        overlayCtx.strokeStyle = item.color; overlayCtx.lineWidth = 3.5;
        overlayCtx.beginPath(); overlayCtx.moveTo(ix, iy); overlayCtx.lineTo(ix + 25, iy); overlayCtx.stroke();
      } else if (item.isDot) {
        overlayCtx.fillStyle = item.color;
        overlayCtx.beginPath(); overlayCtx.arc(ix + 12, iy, 7, 0, Math.PI * 2); overlayCtx.fill();
      }
      overlayCtx.fillStyle = 'rgba(255,255,255,0.88)';
      overlayCtx.fillText(item.label, ix + 33, iy);
    });
  }

  overlayCtx.restore();
}

// ── Main redraw ───────────────────────────────────────────────────────────────
let _raf = null;
function redraw() {
  if (_raf) return;
  _raf = requestAnimationFrame(() => { _raf = null; _doRedraw(); });
}

function _doRedraw() {
  if (!renderer || !state.dist) return;
  const hasSource = state.planes.some(p => p.type === 'source');
  document.getElementById('sl-image-hint').style.display = hasSource ? 'none' : '';
  const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
  renderer.setScene(allPlanes, state.dist, state.fov);
  for (const plane of state.planes) redrawPlaneCanvas(plane);
  drawAxisCanvas();
  drawOverlay();
}
