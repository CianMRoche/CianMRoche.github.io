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

// Invert a 6-digit hex colour (#rrggbb → complement).
function invertHexColor(hex) {
  if (!hex || hex.length < 7) return hex;
  return '#' + [1,3,5].map(i =>
    (255 - parseInt(hex.slice(i, i+2), 16)).toString(16).padStart(2,'0')
  ).join('');
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
  showLegend:      true,
  critGridN:       512,
  critZs:          null,  // null = auto (highest-z source plane)
  dist:            null,
};

function defaultParams(model) {
  if (model === 'pointmass')   return { thetaE: 1.0 };
  if (model === 'sie')         return { b: 1.0, q: 0.75, phi: 0 };
  if (model === 'nfw')         return { kappaS: 0.5, rS: 0.4 };
  if (model === 'gaussian')    return { sigma: 0.06, q: 1.0,  phi: 0, amplitude: 1.0,  color: '#ffffff' };
  if (model === 'exponential') return { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20, color: '#ffffff' };
  if (model === 'point')       return { sigma: 0.08, amplitude: 1.0, color: '#ffffff' };
  if (model === 'pastedimage') return { amplitude: 1.0 };
  return {};
}

function makeObject(type, model, cx = 0, cy = 0) {
  return { id: uid(), model, cx, cy, params: defaultParams(model), showShape: false };
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

function deleteSelectedObject() {
  const pl = selectedPlane();
  if (!pl) return;
  const toDelete = pl.objects.find(o => o.id === state.selectedObjId);
  if (toDelete?.model === 'pastedimage') renderer?.clearPastedTexture(toDelete.id);
  pl.objects = pl.objects.filter(o => o.id !== state.selectedObjId);
  state.selectedObjId = pl.objects[0]?.id ?? null;
  renderSidebar(); rebuildPlaneBoxes(); redraw();
}

function selectedPlane() { return state.planes.find(p => p.id === state.selectedPlaneId) ?? null; }
function selectedObj() {
  const pl = selectedPlane();
  return pl ? (pl.objects.find(o => o.id === state.selectedObjId) ?? null) : null;
}

// Pasted images are stored per-object on obj.pasteCanvas (HTMLCanvasElement|null).
let activeTab = 'settings'; // 'settings' | 'recording'

// ── DOM refs ──────────────────────────────────────────────────────────────────
let renderer = null, glCanvas = null, overlayCtx = null;
let axisCanvas = null, planesEl = null, sidebarEl = null;
let _planeLevels      = new Map();  // plane.id → bump level, kept in sync with drawAxisCanvas
let _draggingPlaneId  = null;       // id of the plane currently being axis-dragged

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
  const smallLens = { id: uid(), model: 'sie', cx: 0.86, cy: 0.71, params: { b: 0.3, q: 0.75, phi: 0 } };
  lp.objects = [
    { id: uid(), model: 'sie', cx: 0, cy: 0, params: { b: 2.3, q: 0.75, phi: 0 } },
    smallLens,
  ];
  const sp = addPlane(1.0, 'source');
  sp.objects = [{ id: uid(), model: 'exponential', cx: 0.3, cy: 0.1,
                  params: { sigma: 0.05, q: 0.40, phi: 0, amplitude: 2.20 } }];
  // Pre-select the small off-axis lens so its params appear on load.
  state.selectedPlaneId = lp.id;
  state.selectedObjId   = smallLens.id;
}

// ── DOM ───────────────────────────────────────────────────────────────────────
function buildDOM() {
  document.getElementById('app').innerHTML = `
    <div class="app-inner">
      <div class="sl-topbar">
        <h1>simpleLens</h1>
        <a class="sl-back-btn" href="/side_projects/">← Side projects</a>
        <button class="sl-demo-btn" id="sl-demo" title="Walk through a tour of the controls">Tour</button>
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
            <div class="sl-rec-dot" id="sl-rec-dot" style="display:none"></div>
          </div>
          <!-- Controls group: right-justified, right-grows -->
          <div class="sl-controls-col">
            <div class="sl-param-col">
              <div class="sl-tabs">
                <div class="sl-param-col-title">Plane Controls</div>
              </div>
              <div id="sl-obj-panel"></div>
            </div>
            <div class="sl-sidebar">
              <div class="sl-tabs" id="sl-tabs">
                <button class="sl-tab-btn active" data-tab="settings">Settings</button>
                <button class="sl-tab-btn" data-tab="recording">Recording</button>
              </div>
              <div class="sl-tab-content" id="sl-tab-settings"></div>
              <div class="sl-tab-content" id="sl-tab-recording" style="display:none"></div>
            </div>
          </div><!-- end sl-controls-col -->
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
  document.getElementById('sl-demo').addEventListener('click', startTour);
  document.getElementById('sl-theme').addEventListener('click', () => {
    const next = (document.documentElement.getAttribute('data-theme') || 'dark') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch {}
    applyThemeIcons(next);
    rebuildPlaneBoxes(); renderSidebar(); redraw();
  });
  applyThemeIcons(document.documentElement.getAttribute('data-theme') || 'dark');

  // Tab switching — static buttons, wired once.
  document.getElementById('sl-tabs').addEventListener('click', e => {
    const btn = e.target.closest('.sl-tab-btn');
    if (!btn) return;
    activeTab = btn.dataset.tab;
    document.querySelectorAll('.sl-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === activeTab));
    document.getElementById('sl-tab-settings').style.display  = activeTab === 'settings'  ? '' : 'none';
    document.getElementById('sl-tab-recording').style.display = activeTab === 'recording' ? '' : 'none';
  });

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
    // Allow shortcuts when a range slider has focus (range inputs don't consume C/R/etc).
    if ((tag === 'INPUT' && type !== 'checkbox' && type !== 'range') || tag === 'TEXTAREA') return;
    // Arrow keys nudge the selected object; skip if any input has focus
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' ||
        e.key === 'ArrowUp'   || e.key === 'ArrowDown') {
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const obj = selectedObj(), pl = selectedPlane();
      if (!obj || !pl) return;
      e.preventDefault();
      const nudge = state.fov / 200;
      if (e.key === 'ArrowLeft')  obj.cx -= nudge;
      if (e.key === 'ArrowRight') obj.cx += nudge;
      if (e.key === 'ArrowUp')    obj.cy += nudge;
      if (e.key === 'ArrowDown')  obj.cy -= nudge;
      if (!recState.progInitialPos) {
        const el = document.getElementById('sl-prog-init-val');
        if (el) el.innerHTML = `(${obj.cx.toFixed(2)}, ${obj.cy.toFixed(2)}) <span class="sl-muted-note">(current)</span>`;
      }
      redrawPlaneCanvas(pl);
      renderSidebar();
      redraw();
      return;
    }

    if (e.key === 'r' || e.key === 'R') {
      recState.active ? stopRecording() : startRecording();
      return;
    }
    if (e.key === 'c' || e.key === 'C') {
      const either = state.showCritCurves || state.showCaustics;
      state.showCritCurves = !either;
      state.showCaustics   = !either;
      renderSidebar(); redraw();
      return;
    }
    if (e.key === 'Escape') {
      state.selectedObjId = null;
      renderSidebar(); rebuildPlaneBoxes(); redraw();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      const pl = selectedPlane();
      if (!pl) return;
      deleteSelectedObject();
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

  function nearestMarker(clientX, clientY) {
    const r   = axisCanvas.getBoundingClientRect();
    const mx  = clientX - r.left;
    const my  = clientY - r.top;
    const Wl  = r.width;
    const Hl  = r.height;
    const axisY = Hl * 0.55;
    const BUMP_STEP = 28;
    const HIT = 14;  // px radius around diamond centre
    let best = null, bestDist = Infinity;
    for (const p of state.planes) {
      const px  = axisZToX(p.z, Wl);
      const lv  = _planeLevels.get(p.id) || 0;
      const py  = axisY - 12 - lv * BUMP_STEP;  // diamond centre-ish
      const d   = Math.hypot(mx - px, my - py);
      if (d < HIT && d < bestDist) { bestDist = d; best = p; }
    }
    // Fallback: x-only hit near the axis tick (for when markers haven't been drawn yet)
    if (!best) {
      for (const p of state.planes) {
        const dx = Math.abs(axisZToX(p.z, Wl) - mx);
        if (dx < AXIS_HIT_PX && dx < bestDist) { bestDist = dx; best = p; }
      }
    }
    return best;
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
      axisCanvas.style.cursor = nearestMarker(e.clientX, e.clientY) ? 'grab' : 'crosshair';
    }
  });

  axisCanvas.addEventListener('pointerleave', () => { axisCanvas.style.cursor = 'crosshair'; });

  axisCanvas.addEventListener('pointerdown', e => {
    if (dragPlane) return;  // never re-target while a drag is already active
    axisCanvas.setPointerCapture(e.pointerId);
    didDrag = false;
    dragPlane = nearestMarker(e.clientX, e.clientY);
    if (dragPlane) {
      _draggingPlaneId = dragPlane.id;
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
    _draggingPlaneId = null;
    drawAxisCanvas();  // recalculate settled levels immediately on release
    axisCanvas.style.cursor = nearestMarker(e.clientX, e.clientY) ? 'grab' : 'crosshair';
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
      // Keep the "Initial pos (current)" display in sync without a full sidebar rebuild.
      if (!recState.progInitialPos && hitObj.id === state.selectedObjId) {
        const el = document.getElementById('sl-prog-init-val');
        if (el) el.innerHTML = `(${hitObj.cx.toFixed(2)}, ${hitObj.cy.toFixed(2)}) <span class="sl-muted-note">(current)</span>`;
      }
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
      renderSidebar(); redraw();  // redraw() updates all plane canvases, clearing stale rings
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
  sie: `<b>b</b> — Deflection scale (arcsec), equal to 4πσ<sub>v</sub>²/c². Proportional to the velocity dispersion squared; independent of distances. The Einstein ring appears at roughly b × (D<sub>LS</sub>/D<sub>S</sub>).<br>
        <b>q</b> — Axis ratio: 1 = circular, lower = more elliptical.<br>
        <b>φ</b> — Position angle of the major axis (radians).`,
  pointmass: `<b>Strength</b> — Mass scale (arcsec): equal to √(4GM / c² D<sub>L</sub>). For a fixed lens redshift, D<sub>L</sub> is constant, so Strength is proportional to √M. The Einstein ring appears at Strength × √(D<sub>LS</sub> / D<sub>S</sub>), so its size also depends on the redshift geometry.`,
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
    <summary class="sl-info-btn">i</summary>
    <div class="sl-info-content">${html}</div>
  </details>`;
}

const SEL = s => `style="font-size:12px;padding:2px 6px;border:1px solid var(--hairline);border-radius:4px;background:var(--bg);color:var(--fg);cursor:pointer;${s||''}"`;

function renderSidebar() {
  const obj = selectedObj(), pl = selectedPlane();
  const ezs = effectiveCritZs();

  // ── Params panel (built first — used in settingsContent below) ──────────────
  let paramsPanel = '';
  if (obj && pl) {
    const isLens = pl.type === 'lens';
    const modelOptions = isLens
      ? `<option value="sie"       ${obj.model==='sie'       ?'selected':''}>SIE (Isothermal ellipsoid)</option>
         <option value="pointmass" ${obj.model==='pointmass' ?'selected':''}>Point mass</option>`
      : `<option value="gaussian"    ${obj.model==='gaussian'    ?'selected':''}>Gaussian</option>
         <option value="exponential" ${obj.model==='exponential' ?'selected':''}>Exponential</option>
         <option value="point"       ${obj.model==='point'       ?'selected':''}>Uniform circle</option>
         <option value="pastedimage" ${obj.model==='pastedimage' ?'selected':''}>Pasted image</option>`;
    const infoHtml = isLens
      ? infoSection('sl-param-info', LENS_INFO[obj.model] ?? '')
      : infoSection('sl-param-info', SOURCE_INFO);
    paramsPanel = `
      <div class="sl-panel">
        <div class="sl-panel-title-row">
          <span class="sl-panel-title">Selected: ${isLens ? 'Lens' : 'Source'}</span>
          ${infoHtml}
        </div>
        <div class="sl-params-meta-row">
          <span class="sl-params-z">z = ${pl.z.toFixed(2)}</span>
          <button class="sl-delete-obj-btn" id="sl-delete-obj">Delete</button>
        </div>
        <select class="sl-select" id="sl-model-select">${modelOptions}</select>
        ${isLens ? lensParamRows(obj) : sourceParamRows(obj)}
      </div>`;
  } else {
    paramsPanel = `<div class="sl-panel"><div class="sl-empty-msg">Click an object in a plane box to edit its parameters.</div></div>`;
  }

  // ── Settings tab ─────────────────────────────────────────────────────────────
  const settingsContent = `
    <div class="sl-panel">
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
        <label><input type="checkbox" id="sl-show-legend"  ${state.showLegend ?'checked':''}> Show legend</label>
      </div>

      <div class="sl-subsection-header">Critical Curves <kbd>C</kbd></div>
      <p class="sl-perf-note">(Can be slow at high resolutions. GIF recording includes them; WebM does not.)</p>
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
    </div>
    <a class="sl-how-link" href="/simplelens-how-it-works/" target="_blank" rel="noopener">How does this work? →</a>`;

  // Programmatic recording display values.
  const selObj = selectedObj(), selPl = selectedPlane();
  const zLine = (selObj && selPl)
    ? `${selPl.type === 'lens' ? 'Lens' : 'Source'} z:&nbsp;&nbsp;${selPl.z.toFixed(2)}`
    : null;
  const initLabel = recState.progInitialPos
    ? `(${recState.progInitialPos.cx.toFixed(2)}, ${recState.progInitialPos.cy.toFixed(2)}) <span style="color:var(--muted)">(locked)</span>`
    : selObj
      ? `(${selObj.cx.toFixed(2)}, ${selObj.cy.toFixed(2)}) <span style="color:var(--muted)">(current)</span>`
      : '<span style="color:var(--muted);font-style:italic">select an object below</span>';
  const finalLabel = recState.progFinalPos
    ? recState.progFinalPos.label
    : '<span style="color:var(--muted);font-style:italic">not set</span>';

  const recordingPanel = `
    <div class="sl-panel">
      <div class="sl-panel-title-row">
        <span class="sl-panel-title">LIVE</span>
        ${infoSection('sl-rec-info', `
          <b>WebM</b> — fast, browser-native. Critical curves are hidden during programmatic recording to keep frame timing correct.<br><br>
          <b>GIF</b> — auto-looping, universally shareable. Slower to encode, 256 colors. GIF programmatic recording includes critical curves at full resolution.`)}
      </div>

      <div class="sl-rec-setting-row">
        <span class="sl-rec-setting-label">Format</span>
        <select id="sl-rec-format" class="sl-capture-fps">
          <option value="webm" ${!recState.useGif?'selected':''}>WebM</option>
          <option value="gif"  ${recState.useGif ?'selected':''}>GIF (slower)</option>
        </select>
      </div>
      <div class="sl-rec-setting-row">
        <span class="sl-rec-setting-label">Frame rate</span>
        <select id="sl-rec-fps" class="sl-capture-fps">
          <option value="5"  ${recState.fps===5  ?'selected':''}>5 fps</option>
          <option value="10" ${recState.fps===10 ?'selected':''}>10 fps</option>
          <option value="15" ${recState.fps===15 ?'selected':''}>15 fps</option>
          <option value="24" ${recState.fps===24 ?'selected':''}>24 fps</option>
          <option value="30" ${recState.fps===30 ?'selected':''}>30 fps</option>
        </select>
      </div>
      <div class="sl-capture-row" style="margin-top:8px">
        <button class="sl-capture-btn" id="sl-snapshot-btn">📷 Save PNG</button>
        <button class="sl-capture-btn ${recState.active ? 'recording' : ''}" id="sl-rec-btn"
                title="Shortcut: R">${recState.active ? '⏹ Stop [R]' : '⏺ Record [R]'}</button>
      </div>

      <div class="sl-rec-subsection-label">Programmatic</div>
      ${zLine ? `<div class="sl-rec-prog-z">${zLine}</div>` : ''}

      <div class="sl-rec-prog-field">
        <span class="sl-rec-prog-key">Initial</span>
        <span class="sl-rec-prog-val" id="sl-prog-init-val">${initLabel}</span>
        <button class="sl-rec-mini-btn" id="sl-prog-set-init" title="Lock current position as start">Set</button>
        ${recState.progInitialPos ? `<button class="sl-rec-mini-btn sl-rec-mini-clear" id="sl-prog-clear-init" title="Revert to using current position">✕</button>` : ''}
      </div>

      <div class="sl-rec-prog-field" style="margin-top:5px">
        <span class="sl-rec-prog-key">Final</span>
        <span class="sl-rec-prog-val">${finalLabel}</span>
        <button class="sl-rec-mini-btn" id="sl-prog-set-final" title="Store current position as end">Set</button>
      </div>

      <div class="sl-rec-prog-field" style="margin-top:5px">
        <span class="sl-rec-prog-key">Duration</span>
        <input type="number" id="sl-prog-duration" min="0.5" max="60" step="0.5" value="${recState.progDuration}"
               class="sl-prog-dur-input">
        <span class="sl-muted-note">s</span>
      </div>

      <div class="sl-capture-row" style="margin-top:8px">
        <button class="sl-capture-btn" id="sl-prog-record">⏺ Record program</button>
      </div>
    </div>`;


  document.getElementById('sl-obj-panel').innerHTML     = paramsPanel;
  document.getElementById('sl-tab-settings').innerHTML  = settingsContent;
  document.getElementById('sl-tab-recording').innerHTML = recordingPanel;

  document.getElementById('sl-fov')?.addEventListener('change',         e => { const v = parseFloat(e.target.value); if (v > 0) { state.fov  = v; redraw(); } });
  document.getElementById('sl-zmax')?.addEventListener('change',        e => { const v = parseFloat(e.target.value); if (v > 0) { state.zMax = v; drawAxisCanvas(); } });
  document.getElementById('sl-show-markers')?.addEventListener('change',e => { state.showMarkers = e.target.checked; redraw(); });
  document.getElementById('sl-show-legend')?.addEventListener('change', e => { state.showLegend  = e.target.checked; redraw(); });
  document.getElementById('sl-snapshot-btn')?.addEventListener('click', captureSnapshot);
  document.getElementById('sl-rec-btn')?.addEventListener('click', () => { recState.active ? stopRecording() : startRecording(); });
  document.getElementById('sl-rec-fps')?.addEventListener('change', e => { recState.fps = parseInt(e.target.value, 10); });
  document.getElementById('sl-rec-format')?.addEventListener('change', e => { recState.useGif = e.target.value === 'gif'; });
  document.getElementById('sl-prog-set-init')?.addEventListener('click', setProgInitialPosition);
  document.getElementById('sl-prog-clear-init')?.addEventListener('click', clearProgInitialPos);
  document.getElementById('sl-prog-set-final')?.addEventListener('click', setProgFinalPosition);
  document.getElementById('sl-prog-duration')?.addEventListener('change', e => { recState.progDuration = parseFloat(e.target.value) || 3; });
  document.getElementById('sl-prog-record')?.addEventListener('click', startProgrammaticRecording);
  document.getElementById('sl-crit-res')?.addEventListener('change', e => { state.critGridN = parseInt(e.target.value, 10); redraw(); });
  document.getElementById('sl-crit-zs')?.addEventListener('change',  e => { const v = parseFloat(e.target.value); if (v > 0) { state.critZs = v; redraw(); } });
  document.getElementById('sl-show-crit')?.addEventListener('change', e => { state.showCritCurves = e.target.checked; redraw(); });
  document.getElementById('sl-show-caus')?.addEventListener('change', e => { state.showCaustics   = e.target.checked; redraw(); });

  if (obj && pl) {
    document.getElementById('sl-delete-obj')?.addEventListener('click', deleteSelectedObject);
    document.getElementById('sl-show-shape')?.addEventListener('change', e => { obj.showShape = e.target.checked; redraw(); });
    document.getElementById('sl-model-select')?.addEventListener('change', e => {
      obj.model = e.target.value; obj.params = defaultParams(obj.model);
      renderSidebar(); redraw();
    });
    document.getElementById('sl-obj-panel').querySelectorAll('input[type="color"][data-param-color]').forEach(inp => {
      inp.addEventListener('input', () => {
        // Picker shows the display colour; store the dark-mode equivalent.
        const light = document.documentElement.getAttribute('data-theme') !== 'dark';
        obj.params.color = light ? invertHexColor(inp.value) : inp.value;
        redraw();
      });
    });
    document.getElementById('sl-obj-panel').querySelectorAll('input[type="range"][data-param]').forEach(inp => {
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

function shapeToggle(obj) {
  return `<label class="sl-shape-toggle">
    <input type="checkbox" id="sl-show-shape" ${obj.showShape ? 'checked' : ''}>
    Show shape
  </label>`;
}

function lensParamRows(obj) {
  const p = obj.params;
  if (obj.model === 'pointmass')
    return sliderRow('Strength (")', 'thetaE', 0.1, 3.0, 0.05, p.thetaE ?? 1)
         + shapeToggle(obj);
  if (obj.model === 'sie')
    return sliderRow('b (")',          'b',   0.1, 3.0,      0.05, p.b      ?? 1)
         + sliderRow('q',              'q',   0.1, 1.0,      0.05, p.q      ?? 0.75)
         + sliderRow('φ (rad)',        'phi', 0,   Math.PI,  0.05, p.phi    ?? 0)
         + shapeToggle(obj);
  if (obj.model === 'nfw')
    return sliderRow('κ<sub>s</sub>',      'kappaS', 0.05, 3.0, 0.05, p.kappaS ?? 0.5)
         + sliderRow('r<sub>s</sub> (")', 'rS',     0.05, 2.0, 0.05, p.rS     ?? 0.4)
         + shapeToggle(obj);
  return '';
}

function sourceParamRows(obj) {
  const p = obj.params;
  if (obj.model === 'point') {
    const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
    const storedColor = p.color ?? '#ffffff';
    const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
    return sliderRow('r (")', 'sigma', 0.005, 1.0, 0.005, p.sigma ?? 0.08)
         + `<div class="sl-param-row">
              <span class="sl-param-label">Color</span>
              <input type="color" data-param-color="1" value="${displayColor}" class="sl-color-input">
            </div>`
         + shapeToggle(obj);
  }

  if (obj.model === 'pastedimage') {
    const hint = obj.pasteCanvas ? '' :
      '<p style="font-size:11px;color:var(--muted);font-style:italic;margin-top:6px">Select this point, then Ctrl+V to paste an image</p>';
    return sliderRow('Brightness', 'amplitude', 0.1, 5.0, 0.1, p.amplitude ?? 1.0) + hint;
  }
  // In light mode the canvas is CSS-inverted, so show the complement in the
  // picker (what actually appears on screen) and invert back on store.
  const isLight    = document.documentElement.getAttribute('data-theme') !== 'dark';
  const storedColor = p.color ?? '#ffffff';
  const displayColor = isLight ? invertHexColor(storedColor) : storedColor;
  return sliderRow('σ (")',   'sigma',     0.005, 0.5, 0.005, p.sigma     ?? 0.06)
       + sliderRow('q',        'q',         0.1,  1.0, 0.05,  p.q         ?? 1.0)
       + sliderRow('φ (rad)',  'phi',        0, Math.PI, 0.05, p.phi       ?? 0)
       + sliderRow('A',        'amplitude',  0.1,  3.0, 0.1,   p.amplitude ?? 1.0)
       + `<div class="sl-param-row">
            <span class="sl-param-label">Color</span>
            <input type="color" data-param-color="1" value="${displayColor}"
                   class="sl-color-input" title="Source light color">
          </div>`
       + shapeToggle(obj);
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

  // Assign vertical levels so close markers bump up instead of overlapping.
  const BUMP_STEP = 28;   // px per level (taller bump for clear separation)
  const MIN_SEP   = 26;   // min px between markers on the same level
  // Assign levels to all non-dragged planes first, then pin the dragged plane
  // above everything so it never flips under a neighbour mid-drag.
  const sorted = [...state.planes]
    .filter(p => p.id !== _draggingPlaneId)
    .sort((a, b) => a.z - b.z);
  const planeLevel = new Map();
  const levelMaxX  = [];
  for (const plane of sorted) {
    const x = axisZToX(plane.z, Wl);
    let lv = 0;
    while (true) {
      if (levelMaxX[lv] === undefined || x - levelMaxX[lv] >= MIN_SEP) {
        levelMaxX[lv] = x; planeLevel.set(plane.id, lv); break;
      }
      lv++;
    }
  }
  if (_draggingPlaneId) {
    const topLevel = levelMaxX.length; // one above the current highest
    planeLevel.set(_draggingPlaneId, topLevel);
  }
  _planeLevels = planeLevel;  // share with hit-testing

  for (const plane of state.planes) {
    const x    = axisZToX(plane.z, Wl);
    const col  = typeColorHex(plane.type);
    const sel  = plane.id === state.selectedPlaneId;
    const lv   = planeLevel.get(plane.id) || 0;
    const dy   = lv * BUMP_STEP;   // extra upward shift

    // Connecting line from axis up to diamond base when bumped
    ctx.strokeStyle = col;
    ctx.lineWidth   = sel ? 2 : 1.5;
    if (lv > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY - 6 - dy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Short axis tick
    ctx.strokeStyle = col; ctx.lineWidth = sel ? 2 : 1.5;
    ctx.beginPath(); ctx.moveTo(x, axisY - 4); ctx.lineTo(x, axisY + 4); ctx.stroke();

    // Diamond
    ctx.fillStyle = col;
    const dTop = axisY - 18 - dy, dMid = axisY - 12 - dy, dBot = axisY - 6 - dy;
    ctx.beginPath();
    ctx.moveTo(x, dTop); ctx.lineTo(x+5, dMid); ctx.lineTo(x, dBot); ctx.lineTo(x-5, dMid);
    ctx.closePath(); ctx.fill();

    // z label above diamond
    ctx.font = '9.5px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(plane.z.toFixed(2), x, dTop - 3);

    // L/S tag below axis
    ctx.fillStyle = dark ? '#8b949e' : '#6b7280';
    ctx.font = '9px system-ui, sans-serif';
    ctx.fillText(plane.type === 'lens' ? 'L' : 'S', x, axisY + 26);
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

  const hasLens     = state.planes.some(p => p.type === 'lens');
  const needCurve   = (state.showCritCurves || state.showCaustics) && state.dist && hasLens;
  const needEllipse = state.planes.some(pl => pl.objects.some(o => o.showShape));
  if (!needCurve && !state.showMarkers && !needEllipse) return;

  const Wl = W/dpr, Hl = H/dpr;
  overlayCtx.save();
  overlayCtx.scale(dpr, dpr);

  function toPixel(ax, ay) {
    return [(ax / state.fov + 0.5) * Wl, (-ay / state.fov + 0.5) * Hl];
  }

  // ── 0. Shape ellipses (drawn first, behind markers) ──────────────────────────
  if (needEllipse) {
    overlayCtx.lineWidth   = 1.5;
    overlayCtx.globalAlpha = 0.6;
    overlayCtx.setLineDash([5, 4]);
    for (const plane of state.planes) {
      const col = typeColorHex(plane.type);
      for (const obj of plane.objects) {
        if (!obj.showShape) continue;
        const [px, py] = toPixel(obj.cx, obj.cy);
        const p = obj.params;
        let a_arc = 0, q = 1, phi = 0;
        if (plane.type === 'lens') {
          if      (obj.model === 'sie')       { a_arc = p.b ?? 1;      q = p.q ?? 0.75; phi = p.phi ?? 0; }
          else if (obj.model === 'pointmass') { a_arc = p.thetaE ?? 1; }
          else if (obj.model === 'nfw')       { a_arc = p.rS ?? 0.4; }
        } else if (obj.model === 'point') {
          a_arc = p.sigma ?? 0.08; q = 1; phi = 0;  // hard edge — draw at exact radius
        } else if (obj.model !== 'pastedimage') {
          a_arc = 2 * (p.sigma ?? 0.1); q = p.q ?? 1; phi = p.phi ?? 0;
        }
        if (a_arc <= 0) continue;
        const a_px = a_arc / state.fov * Wl;
        const b_px = a_px * Math.max(q, 0.01);
        overlayCtx.strokeStyle = col;
        overlayCtx.beginPath();
        overlayCtx.ellipse(px, py, a_px, b_px, -phi, 0, Math.PI * 2);
        overlayCtx.stroke();
      }
    }
    overlayCtx.setLineDash([]);
    overlayCtx.globalAlpha = 1;
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
    // Sample 30% wider than the display FOV so rings near the edge are found in
    // full rather than cut off at the grid boundary.  The display filter below
    // still clips what is actually drawn to the visible image area.
    const samplingFov = state.fov * 1.3;
    const res = computeCritCurvesForZs(
      state.planes, state.dist, effectiveCritZs(), samplingFov, state.critGridN
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

    const _h = state.fov / 2;
    const MIN_CRIT_SEGS = 50;

    // Realness check uses the TOTAL segment count (before the display clip) so a
    // genuine ring near the edge — which has many segments in the wider sample but
    // few within the visible area — is not incorrectly suppressed.
    const isRealCurve = critSegs.length >= MIN_CRIT_SEGS;

    // Clip to the visible image area for display.
    const critFiltered = critSegs.filter(([[x0,y0],[x1,y1]]) =>
      (Math.abs(x0) <= _h && Math.abs(y0) <= _h) ||
      (Math.abs(x1) <= _h && Math.abs(y1) <= _h));
    const causFiltered = causSegs.filter(([[x0,y0],[x1,y1]]) =>
      Math.abs(x0) < _h*2.5 && Math.abs(y0) < _h*2.5 &&
      Math.abs(x1) < _h*2.5 && Math.abs(y1) < _h*2.5);

    if (isRealCurve) {
      if (state.showCritCurves) drawSegs(critFiltered, CRIT_COLOR);
      if (state.showCaustics)   drawSegs(causFiltered, CAUS_COLOR);
    }
  }

  // ── 3. Legend (top-left) ─────────────────────────────────────────────────────
  const legendItems = [];
  if (state.showCritCurves && hasLens) legendItems.push({ color: CRIT_COLOR, label: 'Critical curves', isLine: true });
  if (state.showCaustics   && hasLens) legendItems.push({ color: CAUS_COLOR, label: 'Caustics',        isLine: true });
  if (state.showMarkers && state.planes.some(p => p.type === 'lens'))
    legendItems.push({ color: typeColorHex('lens'),   label: 'Lens position',   isDot: true });
  if (state.showMarkers && state.planes.some(p => p.type === 'source'))
    legendItems.push({ color: typeColorHex('source'), label: 'Source position', isDot: true });

  if (state.showLegend && legendItems.length > 0) {
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
  const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
  renderer.setScene(allPlanes, state.dist, state.fov);
  for (const plane of state.planes) redrawPlaneCanvas(plane);
  drawAxisCanvas();
  drawOverlay();
}

// ── Capture & recording ───────────────────────────────────────────────────────

// Composite the WebGL canvas and 2D overlay into an offscreen canvas.
function buildCompositeCanvas() {
  const gl  = glCanvas;
  const ov  = document.getElementById('sl-overlay');
  const off = document.createElement('canvas');
  off.width  = gl.width;
  off.height = gl.height;
  const ctx  = off.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  ctx.drawImage(ov, 0, 0);
  return off;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href    = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// PNG snapshot.
function captureSnapshot() {
  // Ensure the frame is fully drawn first.
  if (renderer && state.dist) {
    const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
    renderer.setScene(allPlanes, state.dist, state.fov);
    drawOverlay();
  }
  buildCompositeCanvas().toBlob(blob => downloadBlob(blob, 'simplelens.png'), 'image/png');
}

function setProgInitialPosition() {
  const obj = selectedObj();
  if (!obj) return;
  recState.progInitialPos = { cx: obj.cx, cy: obj.cy };
  renderSidebar();
}

function clearProgInitialPos() {
  recState.progInitialPos = null;
  renderSidebar();
}

function setProgFinalPosition() {
  const obj = selectedObj();
  const pl  = selectedPlane();
  if (!obj || !pl) return;
  recState.progFinalPos = {
    cx: obj.cx, cy: obj.cy,
    label: `(${obj.cx.toFixed(2)}, ${obj.cy.toFixed(2)})`,
  };
  renderSidebar();
}

// Animate the selected object from its current position to progFinalPos,
// capturing each frame.  For GIF this runs as fast as possible (delay 0 between
// frames); for WebM it runs in real time so the stream is correctly paced.
function startProgrammaticRecording() {
  if (recState.active) return;
  const obj = selectedObj();
  if (!obj)                  { return; }
  if (!recState.progFinalPos){ return; }

  const fps         = recState.fps;
  const totalFrames = Math.max(2, Math.round(recState.progDuration * fps));
  const frameDelayMs = 1000 / fps;

  // Use the locked initial position if set, otherwise use the object's current position.
  const startCx = recState.progInitialPos?.cx ?? obj.cx;
  const startCy = recState.progInitialPos?.cy ?? obj.cy;
  const { cx: endCx, cy: endCy } = recState.progFinalPos;

  // Live canvas for both WebM and GIF.
  const lc    = document.createElement('canvas');
  lc.width    = glCanvas.width  || 512;
  lc.height   = glCanvas.height || 512;
  recState.liveCanvas = lc;
  recState.active     = true;
  recState.chunks     = [];
  updateRecordingIndicator();

  let frame = 0;

  const doFrame = () => {
    if (!recState.active && frame < totalFrames) {
      // Cancelled mid-way — restore start position.
      obj.cx = startCx; obj.cy = startCy;
      invalidateDistances(); redraw();
      return;
    }
    const t = totalFrames === 1 ? 1 : frame / (totalFrames - 1);
    obj.cx = startCx + (endCx - startCx) * t;
    obj.cy = startCy + (endCy - startCy) * t;

    // Force a synchronous render.
    // GIF: frames are timestamped in metadata so slow computation doesn't
    //      affect playback speed — critical curves render correctly.
    // WebM: captureStream samples at real time; slow computation causes frame
    //       duplication, so critical curves/caustics are suppressed for WebM.
    if (renderer && state.dist) {
      const allPlanes = [...state.planes].sort((a, b) => a.z - b.z);
      renderer.setScene(allPlanes, state.dist, state.fov);
      const savedCrit = state.showCritCurves, savedCaus = state.showCaustics;
      if (!recState.useGif) { state.showCritCurves = false; state.showCaustics = false; }
      drawOverlay();
      state.showCritCurves = savedCrit; state.showCaustics = savedCaus;
    }
    for (const plane of state.planes) redrawPlaneCanvas(plane);
    _compositeToLive();

    if (recState.useGif) recState.gifObj?.addFrame(lc, { copy: true, delay: frameDelayMs });

    frame++;
    if (frame < totalFrames) {
      // GIF: go as fast as possible; WebM: pace to real time.
      setTimeout(doFrame, recState.useGif ? 0 : frameDelayMs);
    } else {
      // All frames done — finalize.
      recState.active = false;
      updateRecordingIndicator();
      clearTimeout(recState.autoStopTimer);
      recState.autoStopTimer = null;
      if (recState.useGif) {
        recState.gifObj?.render();
      } else {
        recState.recorder?.stop();
      }
    }
  };

  if (recState.useGif) {
    const _run = () => {
      const gif = new GIF({ workers: 2, quality: 10, workerScript: 'gif.worker.js',
                            width: lc.width, height: lc.height });
      recState.gifObj = gif;
      gif.on('finished', blob => downloadBlob(blob, 'simplelens-prog.gif'));
      doFrame();
    };
    if (!window.GIF) {
      const s = document.createElement('script');
      s.src = 'gif.js'; s.onload = _run; document.head.appendChild(s);
    } else { _run(); }
  } else {
    const stream   = lc.captureStream(fps);
    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9' : 'video/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    recState.recorder = recorder;
    recorder.ondataavailable = e => { if (e.data.size > 0) recState.chunks.push(e.data); };
    recorder.onstop = () => {
      downloadBlob(new Blob(recState.chunks, { type: 'video/webm' }), 'simplelens-prog.webm');
      recState.chunks = [];
    };
    recorder.start(200);
    _compositeToLive();
    doFrame();
  }
}

// ── Video / GIF recording ─────────────────────────────────────────────────────

const recState = {
  active:    false,
  fps:       15,
  useGif:    false,
  maxSecs:   30,
  recorder:  null,
  chunks:    [],
  gifObj:    null,
  liveCanvas: null,
  rafId:     null,
  frameInterval: null,
  autoStopTimer: null,
  // Programmatic recording
  progInitialPos: null,  // { cx, cy } — null = use current object position at record time
  progFinalPos:   null,  // { cx, cy, label }
  progDuration:   3.0,
};

function updateRecordingIndicator() {
  const dot = document.getElementById('sl-rec-dot');
  if (dot) dot.style.display = recState.active ? '' : 'none';
  const btn = document.getElementById('sl-rec-btn');
  if (btn) {
    btn.textContent = recState.active ? '⏹ Stop [R]' : '⏺ Record [R]';
    btn.classList.toggle('recording', recState.active);
  }
}

function startRecording() {
  if (recState.active) return;
  const fps = recState.fps;

  // Create the live composite canvas once.
  const gl = glCanvas;
  const lc = document.createElement('canvas');
  lc.width  = gl.width  || 512;
  lc.height = gl.height || 512;
  recState.liveCanvas = lc;
  recState.active     = true;
  recState.chunks     = [];
  // Hard cap: auto-stop after maxSecs regardless of user action.
  recState.autoStopTimer = setTimeout(stopRecording, recState.maxSecs * 1000);
  updateRecordingIndicator();

  if (recState.useGif) {
    _startGifRecording(fps, lc);
  } else {
    _startWebMRecording(fps, lc);
  }
}

function stopRecording() {
  if (!recState.active) return;
  recState.active = false;
  clearTimeout(recState.autoStopTimer);
  cancelAnimationFrame(recState.rafId);
  clearInterval(recState.frameInterval);
  recState.rafId = null;
  recState.frameInterval = null;
  recState.autoStopTimer = null;
  updateRecordingIndicator();

  if (recState.useGif) {
    recState.gifObj?.render();
  } else {
    recState.recorder?.stop();
  }
}

function _compositeToLive() {
  if (!recState.liveCanvas) return;
  const lc  = recState.liveCanvas;
  const gl  = glCanvas;
  const ov  = document.getElementById('sl-overlay');
  if (lc.width !== gl.width || lc.height !== gl.height) {
    lc.width  = gl.width;
    lc.height = gl.height;
  }
  const ctx = lc.getContext('2d');
  ctx.drawImage(gl, 0, 0);
  ctx.drawImage(ov, 0, 0);
}

function _startWebMRecording(fps, liveCanvas) {
  // Drive the live canvas at the chosen FPS.
  const ms = 1000 / fps;
  recState.frameInterval = setInterval(() => {
    if (!recState.active) return;
    _compositeToLive();
  }, ms);

  const stream   = liveCanvas.captureStream(fps);
  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
    ? 'video/webm;codecs=vp9' : 'video/webm';
  const recorder = new MediaRecorder(stream, { mimeType });
  recState.recorder = recorder;

  recorder.ondataavailable = e => { if (e.data.size > 0) recState.chunks.push(e.data); };
  recorder.onstop = () => {
    const blob = new Blob(recState.chunks, { type: 'video/webm' });
    downloadBlob(blob, 'simplelens.webm');
    recState.chunks = [];
  };
  recorder.start(200); // collect data every 200ms
  // First composite immediately so the stream isn't blank.
  _compositeToLive();
}

function _startGifRecording(fps, liveCanvas) {
  // Lazy-load gif.js from the local copy (avoids cross-origin worker issues).
  if (!window.GIF) {
    const script  = document.createElement('script');
    script.src    = 'gif.js';
    script.onload = () => _initGifEncoder(fps, liveCanvas);
    script.onerror = () => console.error('simpleLens: could not load gif.js');
    document.head.appendChild(script);
  } else {
    _initGifEncoder(fps, liveCanvas);
  }
}

function _initGifEncoder(fps, liveCanvas) {
  /* global GIF */
  const gif = new GIF({
    workers: 2,
    quality: 10,
    workerScript: 'gif.worker.js',   // same-origin — no CSP issues
  });
  recState.gifObj = gif;

  gif.on('finished', blob => downloadBlob(blob, 'simplelens.gif'));

  const delay = Math.round(1000 / fps);
  recState.frameInterval = setInterval(() => {
    if (!recState.active) return;
    _compositeToLive();
    gif.addFrame(liveCanvas, { copy: true, delay });
  }, delay);

  _compositeToLive();
}

// ── Tour / tutorial ───────────────────────────────────────────────────────────

const TOUR_STEPS = [
  {
    target: '.sl-timeline',
    arrow: 'above',
    label: 'Redshift timeline',
    text: 'The bar at the bottom is the <b>redshift timeline</b>. It represents the line of sight from the observer (left, z = 0) to distant galaxies (right). Click anywhere on the axis to place a new lens or source plane at that redshift.',
  },
  {
    target: '.sl-planes',
    arrow: 'above',
    label: 'Plane viewer',
    text: 'Each plane you add appears here as a small panel. The <b>canvas</b> shows a projected view of that plane. Dots represent lens masses or light sources. Click to select them, drag to move them. Click empty space in a plane to add a new object.',
  },
  {
    target: '.sl-plane-box',
    arrow: 'above',
    label: 'Lens / source planes',
    text: 'Use the <b>Lens / Src</b> buttons at the top of each panel to switch the plane type. A <b>lens plane</b> contains mass that deflects light; a <b>source plane</b> contains light emitting objects. You can have multiple of each at different redshifts.',
  },
  {
    target: '#sl-obj-panel',
    arrow: 'left',
    label: 'Plane Controls',
    text: 'When an object is selected in a plane panel, its parameters appear here. Choose the mass or light profile from the dropdown, then adjust sliders for Einstein radius, axis ratio, position angle, brightness, and more.',
  },
  {
    target: '#sl-image-wrap',
    arrow: 'right',
    label: 'Lensed image',
    text: 'This is the <b>primary image panel</b>, showing what an observer at z = 0 would see. Light from source planes is bent by all intervening lens planes using full multiplane gravitational lensing. The image updates in real time as you move or adjust objects.',
  },
  {
    target: '.sl-tab-btn[data-tab="settings"]',
    arrow: 'left',
    label: 'Settings',
    text: 'The <b>Settings tab</b> controls the field of view and maximum redshift. The Critical Curves section lets you toggle the curves that mark where the number of lensed images changes. Press <kbd>C</kbd> to toggle them.',
  },
  {
    target: '.sl-tab-btn[data-tab="recording"]',
    arrow: 'left',
    label: 'Recording',
    text: 'The <b>Recording tab</b> has two modes. <b>Live</b> recording captures whatever you do — press Record, interact with the simulation, press Stop, and download the result as a WebM video or GIF. <b>Programmatic</b> recording automatically animates a selected object in a straight line between two positions at a chosen speed — set a start, set an end, and hit Record Program.',
  },
  {
    target: null,
    arrow: null,
    label: 'Ready to explore',
    text: 'That\'s the full tour! Try clicking on the redshift axis to add planes, moving the objects in the plane panels, and watching the lensed image update live. :)',
    final: true,
  },
];

function _tourClamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

const tour = {
  active: false, step: 0,
  backdrop: null, spotlight: null, tooltip: null, quitBtn: null,
};

function startTour() {
  if (tour.active) return;
  tour.active = true;
  tour.step   = 0;

  tour.backdrop  = document.createElement('div');
  tour.backdrop.className = 'tutorial-backdrop';
  tour.spotlight = document.createElement('div');
  tour.spotlight.className = 'tutorial-spotlight';
  tour.tooltip   = document.createElement('div');
  tour.tooltip.className = 'tutorial-tooltip';
  document.body.appendChild(tour.backdrop);
  document.body.appendChild(tour.spotlight);
  document.body.appendChild(tour.tooltip);

  window.addEventListener('resize', repositionTour);
  showTourStep();
}

function showTourStep() {
  const s = TOUR_STEPS[tour.step];
  if (!s) { endTour(); return; }

  let targetRect = null;
  if (s.target) {
    const el = document.querySelector(s.target);
    if (el) targetRect = el.getBoundingClientRect();
  }

  if (targetRect && targetRect.width > 0) {
    tour.spotlight.classList.remove('no-target');
    const pad = 6;
    Object.assign(tour.spotlight.style, {
      left:   `${targetRect.left - pad}px`,
      top:    `${targetRect.top  - pad}px`,
      width:  `${targetRect.width  + 2 * pad}px`,
      height: `${targetRect.height + 2 * pad}px`,
    });
  } else {
    tour.spotlight.classList.add('no-target');
    Object.assign(tour.spotlight.style, { left: '50%', top: '50%', width: '0', height: '0' });
  }

  const isFinal = !!s.final;
  tour.tooltip.innerHTML = `
    <div class="tt-arrow"></div>
    <div class="tt-step">Step ${tour.step + 1} / ${TOUR_STEPS.length} · ${s.label || ''}</div>
    <div class="tt-body">${s.text}</div>
    <div class="tt-actions">
      <button class="tt-skip" id="tt-skip">${isFinal ? 'Close' : 'Skip'}</button>
      <button class="primary tt-next" id="tt-next">${isFinal ? 'Finish' : 'Next →'}</button>
    </div>`;
  document.getElementById('tt-next').addEventListener('click', tourNext);
  document.getElementById('tt-skip').addEventListener('click', endTour);

  positionTourTooltip(targetRect, s.arrow);
}

function repositionTour() {
  if (!tour.active) return;
  const s = TOUR_STEPS[tour.step];
  if (!s) return;
  let targetRect = null;
  if (s.target) {
    const el = document.querySelector(s.target);
    if (el) targetRect = el.getBoundingClientRect();
  }
  if (targetRect && targetRect.width > 0) {
    const pad = 6;
    Object.assign(tour.spotlight.style, {
      left:   `${targetRect.left - pad}px`,
      top:    `${targetRect.top  - pad}px`,
      width:  `${targetRect.width  + 2 * pad}px`,
      height: `${targetRect.height + 2 * pad}px`,
    });
  }
  positionTourTooltip(targetRect, s.arrow);
}

function positionTourTooltip(targetRect, preferred) {
  const tt = tour.tooltip;
  tt.classList.remove('above', 'below', 'left', 'right');
  tt.style.visibility = 'hidden';
  tt.style.left = '0px'; tt.style.top = '0px';
  const ttRect = tt.getBoundingClientRect();
  const ttW = ttRect.width, ttH = ttRect.height;
  const margin = 22;
  let left, top, side = null;

  if (!targetRect || targetRect.width === 0) {
    left = (window.innerWidth  - ttW) / 2;
    top  = (window.innerHeight - ttH) / 2;
  } else {
    const cx = targetRect.left + targetRect.width  / 2;
    const cy = targetRect.top  + targetRect.height / 2;
    const space = {
      below: window.innerHeight - targetRect.bottom,
      above: targetRect.top,
      right: window.innerWidth  - targetRect.right,
      left:  targetRect.left,
    };
    const need = { below: ttH + margin, above: ttH + margin, right: ttW + margin, left: ttW + margin };
    const sides = ['below', 'above', 'right', 'left'];
    let chosen = preferred && space[preferred] >= need[preferred]
      ? preferred
      : sides.slice().sort((a, b) => space[b] - space[a])[0];
    side = chosen;
    switch (chosen) {
      case 'below': top  = targetRect.bottom + margin; left = cx - ttW / 2; break;
      case 'above': top  = targetRect.top - ttH - margin; left = cx - ttW / 2; break;
      case 'right': left = targetRect.right + margin;  top  = cy - ttH / 2; break;
      case 'left':  left = targetRect.left  - ttW - margin; top = cy - ttH / 2; break;
    }
  }
  const VP = 12;
  left = _tourClamp(left, VP, window.innerWidth  - ttW - VP);
  top  = _tourClamp(top,  VP, window.innerHeight - ttH - VP);
  tt.style.left = `${left}px`;
  tt.style.top  = `${top}px`;
  if (side) tt.classList.add(side);

  const arrow = tt.querySelector('.tt-arrow');
  if (arrow && targetRect && side) {
    const cx = targetRect.left + targetRect.width  / 2;
    const cy = targetRect.top  + targetRect.height / 2;
    if (side === 'below' || side === 'above') {
      arrow.style.left = `${_tourClamp(cx - left, 14, ttW - 14) - 6}px`;
      arrow.style.top  = '';
    } else {
      arrow.style.top  = `${_tourClamp(cy - top,  14, ttH - 14) - 6}px`;
      arrow.style.left = '';
    }
  } else if (arrow) {
    arrow.style.display = 'none';
  }
  tt.style.visibility = '';
}

function tourNext() {
  tour.step++;
  if (tour.step >= TOUR_STEPS.length) { endTour(); return; }
  showTourStep();
}

function endTour() {
  if (!tour.active) return;
  tour.active = false;
  window.removeEventListener('resize', repositionTour);
  tour.backdrop?.remove();  tour.spotlight?.remove();  tour.tooltip?.remove();
  tour.backdrop = tour.spotlight = tour.tooltip = null;
}
