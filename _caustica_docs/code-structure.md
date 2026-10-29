---
title: "12. Code structure"
nav_title: "12. Code structure"
order: 13
---

Caustica is plain JavaScript with no framework or build step, in `/assets/caustica/`. Edit the files and reload the page.

| File | Lines | Role |
|---|---|---|
| `lens.js` | ~600 | Physics on the CPU, no page access |
| `renderer.js` | ~2100 | WebGL2 drawing; the lensing itself runs per pixel on the GPU |
| `main.js` | ~10200 | Everything else: state, interface, overlays, configs, recording |
| `style.css` | ~3000 | Layout and theming |
| `gif.js`, `gif.worker.js` | | GIF encoder (third-party) |

## `lens.js`

- **Cosmology** (<a href="/caustica-documentation/cosmology/">§2</a>): `comovingDist`, `angDiamDist`, `angDiamDistBetween`, and `precomputeDistances(planes)`, which builds the distance tables for a set of planes.
- **Deflections** (<a href="/caustica-documentation/lens-models/">§5</a>): one function per model, matching the shader's.
- **Ray tracing**: `traceRay` follows one ray through the planes (<a href="/caustica-documentation/multiplane/">§3</a>); `traceSourceGrid` traces a whole grid.
- **Curves** (<a href="/caustica-documentation/critical-curves/">§9</a>): `computeCriticalCurves` finds critical curves and caustics on a traced grid, and `computeDiscImageOutlines` finds the line-art disc outlines on the same grid. `chainSegments`, `smoothPolylines` and `chainCurves` join and smooth the pieces.

## `renderer.js`

The `Renderer` class owns the WebGL2 context. `main.js` hands it the scene with `setScene(...)`, plus properties for the background, observation, masks and detector. One fragment shader repeats the physics of `lens.js` on the GPU (ray tracing, deflections, source profiles, potentials, colour maps), so each pixel is computed independently. Its limits, `MAX_PLANES` (8) and `MAX_OBJECTS` (32 per type), are exported so the interface can warn about them.

Each frame is one of:

- **Lensed image or Unlensed**: per pixel, trace to each source's plane, add up the light, apply the brightness stretch, and put the background and observation behind it (<a href="/caustica-documentation/background-image/#compositing">§7</a>). With an instrument on, this is drawn off-screen, blurred and binned (`_detectorPlan`, `_blurInPlace`, `_runDetectorPasses`; <a href="/caustica-documentation/instrument/">§8</a>).
- **Quantity map** (<a href="/caustica-documentation/lensing-quantities/">§4</a>): $\kappa$, $\gamma$, $\lvert\mu\rvert$, $\lvert\boldsymbol{\alpha}\rvert$ and parity come from the Jacobian, using four extra rays per pixel; the Fermat contours from the arrival-time surface. The image-number counts are drawn on the overlay instead.
- **Delensed image** (`_drawDelensed`): three passes. The main shader writes each grid point's $\boldsymbol{\beta}$ and $\lvert\mu\rvert$ to a floating-point image; a mesh pass draws the grid's triangles at their source positions, adding up $\lvert\mu\rvert$-weighted colour; a last pass divides out the weights (<a href="/caustica-documentation/background-image/#delensed-view">§7</a>).
- **Source magnification** (`_drawSourceMag`): the same mesh, adding up only $\lvert\mu\rvert$, then coloured like a map.

## `main.js`

**State.** `state` holds the scene and the focused view's settings. `state.planes` is the list of planes, sorted by redshift, each with its `objects` (`type`, `model`, `cx`, `cy`, `params`, `hidden`, and `hybridId` for the two halves of a hybrid). Masks live on `state.obs`, beside the planes, so nothing that traces rays sees them. `CONFIG_DEFAULTS` gives the starting value of every view setting. `record()` takes an undo snapshot after each scene edit, and `undo()` / `redo()` restore them.

**Views.** `_panes` holds one or two panes, each with its tabs and its own copy of the per-view settings, and `_focusPane` is the one last clicked. `state` always holds the focused pane's values; `_withPane(i, fn)` swaps a pane's values in while it is drawn. `PANE_OWN_KEYS` (curve, caustic and marker toggles) always belong to each pane, and the `LINK_GROUPS` do once unlinked (`setLink`). `setVizMode` sets the focused pane's view.

**Drawing a frame.** `redraw()` schedules `_doRedraw()`, which pushes the background, observation and detector settings to the renderer (`syncBackdrop`, `syncDetector`), draws the second pane (if any) and copies it to that pane's canvas, then draws the first pane. `_renderGL()` chooses what the renderer draws for the current view. `drawOverlay()` then draws, per pane, everything on the 2D canvas above the image: critical curves and caustics, markers, point-source images, shape outlines, ruler, legend, scale bar, and line art (`drawLineArtBase`).

**Interface.** `buildDOM()` builds the page once. The right-hand panels are rebuilt from templates by `renderSidebar()` (`renderViewPanel()` and others), the scene drawer by `renderDrawer()` and `renderSightLine()`, and the tab strips by `renderTabs()`. Pointer handling is in `attachImageHandlers` (the image), `attachPlaneCardHandlers` (plane viewers), `attachSightHandlers` (the line-of-sight strip) and `attachPaneHandlers` (tabs and split views); keys are in `attachHandlers`, with the list in `SHORTCUTS`.

**Configs.** `configToYaml()` writes the scene and settings, with `_paneLayoutYaml()` adding the view layout. `parseYamlConfig()` reads a file back and checks every value (known model names, colour format, numeric ranges); missing settings fall back to `CONFIG_DEFAULTS`, and `_applyPaneLayout()` restores the layout last. Picture names (`bgImage`, `obsImage`, `image:`) must pass `isPresetBgName()`, a single fixed folder, so a config cannot load an arbitrary address. Presets are listed in `PRESETS`, with their files in `/images/caustica-presets/`.

### Where to find things

| Feature | Where |
|---|---|
| Point-source images | `findPointSourceImages` → `imageSearchGrid` + `solveImages` |
| Critical curves for the view | `viewCritCurves`, `computeCritCurvesForZs` (cached) |
| Image number map | `imageNumberCounts`, `drawImageNumberGrid` |
| Fermat markers and time delays | `findStationaryPoints`, `_computeFullFermat` |
| Stretch whiskers | `computeStretchField` |
| Einstein-radius readout | `computeThetaE` |
| Changing an object's model | `switchModel` (`CARRY_PARAMS`) |
| Use lensed image | `useLensedAsObservation` |
| PNG, video, GIF | `captureSnapshot`, `buildCompositeCanvas`, `startRecording` / `stopRecording`, `startProgrammaticRecording` |
| SVG export | `exportLineArtSVG` |
| Full screen | `setPresenting` |
| Tour, shortcut list | `startTour`, `toggleKbdOverlay` |

## `style.css`

Colours are CSS variables, with `html[data-theme="dark"]` overrides for the dark theme. The layout is a CSS grid: on a computer, the image area and scene drawer, then the panels, then the icon column on the right. At 640 px wide or less it becomes one scrolling column, and short landscape windows (480 px tall or less) ask for a taller window. In the light theme the lensed-image canvas is inverted with a CSS filter (kept in step with `glCanvasInverted()` in `main.js`).

## `gif.js` + `gif.worker.js`

A local copy of the gif.js library, loaded only when a GIF is recorded. Its worker has one change: colour lookups are cached, since every frame uses the same 256-colour palette.
