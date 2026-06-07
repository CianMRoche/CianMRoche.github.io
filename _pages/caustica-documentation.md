---
layout: doc
title: "How Caustica works"
permalink: /caustica-documentation/
---

[Caustica](/assets/caustica/) is a tool for easily visualizing strong gravitational lensing, named after the term used by 17th century mathematicians for the curves onto which refracted light rays converge, which were capable of burning objects.

---

## Quick start

1. **Click the redshift axis** (bottom left) to add an empty plane. Drag existing plane markers to reposition them along the axis.
2. **Pick a tool** using the L / S / H toolbar (or press 1 / 2 / 3): Lens (deflects light), Source (emits light), or Hybrid (both at once, shown as a purple dot).
3. **Click inside a plane panel** to place an object. Drag from an existing marker to move it. You can also drag objects directly in the main image panel.
4. **Adjust parameters** in the Object Controls panel on the right. For hybrid objects, separate collapsible sections appear for the lens and source halves. The eye button excludes an object from the computation without deleting it.
5. **The image panel** updates in real time. Press C to overlay critical curves and caustics. Use the recording tab to save a PNG, WebM, or GIF.
6. **Save and load configurations** using the Save YAML / Load YAML buttons at the bottom of the Settings tab. The file stores all planes, objects, and parameters.

---

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` / `2` / `3` | Select add mode: Lens / Source / Hybrid |
| `C` | Toggle critical curves and caustics |
| `H` | Hide / show the selected object |
| `O` | Clear all objects from the selected plane |
| `X` | Delete the selected plane |
| `R` | Start / stop live recording |
| `↑ ↓ ← →` | Nudge selected object (hold for acceleration) |
| `Delete` / `Backspace` | Delete the selected object |
| `Escape` | Deselect |

---

## 1. Coordinate system

All angular positions are measured in **arcseconds** (″): object coordinates $(c_x, c_y)$, deflection angles, and size parameters all use this unit.
The image panel shows a square patch of sky of side *field of view* `fov` (default 4″), centred on the optical axis.
Radians appear only in intermediate formulae and are converted back to arcseconds throughout.

---

## 2. Cosmological distances

The simulation uses a spatially flat ΛCDM cosmology with the following fixed parameters:

| Symbol | Value | Meaning |
|---|---|---|
| $H_0$ | 70 km s⁻¹ Mpc⁻¹ | Hubble constant |
| $\Omega_m$ | 0.3 | Matter density parameter |
| $\Omega_\Lambda$ | 0.7 | Dark-energy density parameter |
| $c$ | $2.998\times10^5$ km s⁻¹ | Speed of light |

### Dimensionless Hubble parameter

$$E(z) = \sqrt{\Omega_m(1+z)^3 + \Omega_\Lambda}$$

$E(z)$ encodes how the expansion rate changes with redshift.

### Comoving and angular diameter distances

The **comoving distance** to redshift $z$ is:

$$\chi(z) = D_H \int_0^z \frac{dz'}{E(z')}, \qquad D_H = \frac{c}{H_0} \approx 4283\;\text{Mpc}$$

The **angular diameter distances** used in the lensing formula are:

$$D(0,z) = \frac{\chi(z)}{1+z} \qquad \text{(observer to redshift } z\text{)}$$

$$D(z_1, z_2) = \frac{\chi(z_2) - \chi(z_1)}{1+z_2} \qquad \text{(between two redshifts, flat universe)}$$

### Numerical integration

$\chi(z)$ has no closed form and is evaluated with the **midpoint Riemann rule** at $n = 200$ steps:

$$\chi(z) \;\approx\; D_H \cdot \Delta z \cdot \sum_{i=0}^{n-1} \frac{1}{E\left(\bigl(i+\tfrac{1}{2}\bigr)\Delta z\right)}, \qquad \Delta z = \frac{z}{n}$$

For $n = 200$ and $z \leq 5$ the relative error in $\chi$ is below $0.01\%$, negligible for lensing purposes.

Distances are precomputed once whenever the plane configuration changes and packed into two arrays passed to the GPU:

| Array | Entry | Meaning |
|---|---|---|
| `D_obs[i]` | $D(0, z_i)$ | Observer to plane $i$ |
| `D_btwn[i,j]` | $D(z_i, z_j)$ | Between planes $i$ and $j$ |

---

## 3. Multiplane lensing recursion

Planes are sorted by increasing redshift.
A ray **observed** at image-plane angle $\boldsymbol{\theta}$ (a 2-D vector in arcsec) is traced forward through each plane in order.
Its angular position at plane $j$ is given by the *multiplane recursion* (Schneider, Ehlers & Falco 1992):

$$\boldsymbol{\theta}_j \;=\; \boldsymbol{\theta} \;-\; \sum_{k\,<\,j} \frac{D_{kj}}{D_j}\;\hat{\boldsymbol{\alpha}}_k\left(\boldsymbol{\theta}_k\right)$$

| Symbol | Meaning |
|---|---|
| $\boldsymbol{\theta}$ | Observed angle (image-plane position); fixed for each rendered pixel |
| $\boldsymbol{\theta}_j$ | Ray's angular position at plane $j$ (arcsec) |
| $D_{kj}$ | Angular diameter distance from plane $k$ to plane $j$ |
| $D_j$ | Angular diameter distance from observer to plane $j$ |
| $\hat{\boldsymbol{\alpha}}_k(\boldsymbol{\theta}_k)$ | Deflection angle from all lens objects in plane $k$, evaluated at the ray's position $\boldsymbol{\theta}_k$ |

Each object carries its own type, **lens** or **source**, independently of which plane it belongs to.
Only lens objects enter the deflection sum; source objects are passive and receive the ray without contributing to it.
A plane containing both types is a **hybrid plane**; its lens objects deflect and its source objects emit, handled separately by the same recursion.
The weight $D_{kj}/D_j$ converts the deflection at plane $k$ into its angular displacement at the later plane $j$.

The position at the target plane is the **source-plane position** $\boldsymbol{\beta}$, where source brightness is sampled.

> Because each lens plane evaluates its deflection at the ray's *already-deflected* position $\boldsymbol{\theta}_k$, successive lens planes interact non-linearly, a key feature of multiplane lensing absent in single-plane calculations.

---

## 4. Lens deflection models

All models take the ray–lens separation $\mathbf{u} = \boldsymbol{\theta}_k - (c_x, c_y)$ (arcsec) and return a deflection angle $\hat{\boldsymbol{\alpha}}$ (arcsec).

### Point mass

$$\hat{\boldsymbol{\alpha}}(\mathbf{u}) = \frac{b^2}{|\mathbf{u}|^2}\,\mathbf{u}$$

The deflection is radial with magnitude $b^2/\lvert\mathbf{u}\rvert$.
The parameter $b$ (labelled **Strength** in the controls, arcsec) equals $\sqrt{4GM/c^2 D_L}$, so $b \propto \sqrt{M}$ at fixed redshift.
The Einstein ring forms at $\lvert\boldsymbol{\theta}\rvert = b\sqrt{D_{LS}/D_S}$, not at $b$ itself, because the multiplane weight $D_{LS}/D_S$ is applied separately ($D_{LS}$: lens-to-source angular diameter distance; $D_S$: observer-to-source).

### SIE (Singular Isothermal Ellipsoid)

A standard model for galaxy-scale lenses (Kormann et al. 1994).
The projected surface density falls as $1/r_e$ (defined below).

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec) $= 4\pi\sigma_v^2/c^2$; independent of distances |
| $q$ | Axis ratio $0 \lt q \leq 1$ ($q=1$: circular) |
| $\varphi$ | Position angle of major axis (radians, from the $x$-axis) |

**Step 1:** rotate to principal axes using $\varphi$:

$$x_r = \cos\varphi\, u_x + \sin\varphi\, u_y, \qquad y_r = -\sin\varphi\, u_x + \cos\varphi\, u_y$$

**Step 2:** elliptical radius with softening $s = 0.001''$ to regularise the origin:

$$r_e = \sqrt{q^2(x_r^2 + s^2) + y_r^2}$$

**Step 3:** deflection in the principal frame, with $A = bq\,/\,\sqrt{1-q^2}$:

$$\alpha_{x_r} = A\arctan\left(\frac{\sqrt{1-q^2}\cdot x_r}{r_e + s}\right), \qquad \alpha_{y_r} = A\operatorname{arctanh}\left(\frac{\sqrt{1-q^2}\cdot y_r}{r_e + q^2 s}\right)$$

The arctanh function is absent in GLSL ES, so the shader uses $\operatorname{arctanh}(x) = \tfrac{1}{2}\ln\left(\dfrac{1+x}{1-x}\right)$.

**Step 4:** rotate back to the sky frame:

$$\alpha_x = \cos\varphi\,\alpha_{x_r} - \sin\varphi\,\alpha_{y_r}, \qquad \alpha_y = \sin\varphi\,\alpha_{x_r} + \cos\varphi\,\alpha_{y_r}$$

In the circular limit $q\to 1$, both arguments vanish and L'Hôpital's rule gives $\lvert\hat{\boldsymbol{\alpha}}\rvert\to b$: the constant-magnitude deflection of the singular isothermal sphere.

### EPL (Elliptical Power Law)

A generalisation of the SIE in which the density slope is a free parameter.
The projected surface density follows $\Sigma \propto r_e^{1-\gamma}$, where $r_e$ is the elliptical radius and $\gamma$ is the power-law slope; $\gamma = 2$ recovers the SIE exactly.

The deflection is the SIE result scaled by a radial factor:

$$\hat{\boldsymbol{\alpha}}_\text{EPL}(\mathbf{u}) = \left(\frac{r_e}{b}\right)^{2-\gamma} \hat{\boldsymbol{\alpha}}_\text{SIE}(\mathbf{u})$$

where $r_e$ is the elliptical radius from step 2 of the SIE and $\hat{\boldsymbol{\alpha}}_\text{SIE}$ is the SIE deflection at that position.

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), same role as in SIE |
| $q$ | Axis ratio $0 \lt q \leq 1$ |
| $\varphi$ | Position angle of the major axis (radians) |
| $\gamma$ | Power-law slope: $\gamma = 2$ isothermal, $\gamma \lt 2$ steeper central density, $\gamma \gt 2$ shallower. Observed galaxies typically have $\gamma \approx 1.9$–$2.1$. |
| $r_e$ | Elliptical radius from SIE step 2: $r_e = \sqrt{q^2(x_r^2+s^2)+y_r^2}$ |

### External shear

Models the tidal field from mass not explicitly included as a lens plane (e.g. a galaxy cluster along the line of sight, or neighbouring structures). The deflection is linear in the observed angle $\boldsymbol{\theta}$, always evaluated relative to the coordinate origin:

$$\hat{\alpha}_x = \gamma_\text{ext}(\theta_x \cos 2\varphi + \theta_y \sin 2\varphi)$$

$$\hat{\alpha}_y = \gamma_\text{ext}(\theta_x \sin 2\varphi - \theta_y \cos 2\varphi)$$

This follows from the lensing potential $\psi = \tfrac{\gamma_\text{ext}}{2}\left[(\theta_x^2 - \theta_y^2)\cos 2\varphi + 2\theta_x \theta_y \sin 2\varphi\right]$.

| Symbol | Meaning |
|---|---|
| $\gamma_\text{ext}$ | Shear strength (dimensionless). Typical values 0.01–0.2 for galaxy-scale lenses. |
| $\varphi$ | Shear position angle (radians), aligned with the direction of the tidal field. |

The shear object's position in the plane panel has no effect on the lensing computation — the deflection is always computed relative to the coordinate origin. The marker and direction arrow can be repositioned freely for visual organisation.

### Constant deflection

Models the monopole contribution from a massive perturber far outside the field of view. All rays are deflected by the same constant angle regardless of their image-plane position:

$$\hat{\alpha}_x = \alpha\cos\varphi, \qquad \hat{\alpha}_y = \alpha\sin\varphi$$

This shifts caustics bodily without distorting them. It is the dominant effect of a distant perturber; at large separations shear (the quadrupole term) becomes the next-order correction.

| Symbol | Meaning |
|---|---|
| $\alpha$ | Deflection amplitude (arcsec). |
| $\varphi$ | Deflection direction (radians). |

The object's position has no effect on the lensing.

### External convergence

Models a uniform mass sheet along the line of sight (e.g. an overdense filament or underdense void). The deflection is purely radial, always evaluated relative to the coordinate origin:

$$\hat{\alpha}_x = \kappa\,\theta_x, \qquad \hat{\alpha}_y = \kappa\,\theta_y$$

This follows from the potential $\psi = \tfrac{\kappa}{2}\lvert\boldsymbol{\theta}\rvert^2$ and is isotropic — no preferred direction.

| Symbol | Meaning |
|---|---|
| $\kappa$ | Convergence (dimensionless). Positive for overdense structures, negative for underdense voids. |

The object's position has no effect on the lensing. External convergence is related to the **mass sheet degeneracy**: a uniform sheet cannot be distinguished from a rescaling of all lens masses and source distances using image positions alone.

---

## 5. Source brightness models

Once a ray arrives at a plane at position $\boldsymbol{\beta}$, the brightness of each source object at that plane is evaluated.
The elliptically-weighted separation from the source centre is:

$$\mathbf{d} = \boldsymbol{\beta} - (c_x, c_y), \qquad \begin{pmatrix}x_r \\ y_r\end{pmatrix} = R(-\varphi)\,\mathbf{d}, \qquad r_\text{ell}^2 = x_r^2 + (y_r/q)^2$$

where $R(-\varphi)$ rotates by $-\varphi$ to align with the source axes.
Note: $r_\text{ell}$ differs from the lens elliptical radius $r_e$ by a factor of $q$, reflecting different conventions in their respective fields. For sources, $\sigma$ is the semi-major axis of the brightness isophote (the standard in galactic photometry). For lenses, the Kormann et al. (1994) convention keeps the deflection scale $b$ independent of $q$.

| Symbol | Meaning |
|---|---|
| $(c_x, c_y)$ | Source centre (arcsec) |
| $\varphi$ | Position angle of major axis (radians) |
| $q$ | Axis ratio minor/major, $0 \lt q \leq 1$ |
| $\sigma$ | Scale radius (arcsec) |
| $A$ | Amplitude (peak surface brightness) |

### Gaussian

$$I = A\exp\left(-\frac{r_\text{ell}^2}{2\sigma^2}\right)$$

The Show Shape ellipse is drawn at $r_\text{ell} = 2\sigma$.

### Exponential

$$I = A\exp\left(-\frac{r_\text{ell}}{\sigma}\right)$$

More extended than Gaussian; $\sigma$ is the exponential scale length. This is a Sérsic profile with $n=1$.

### Uniform circle

$$I = \begin{cases} A & r_\text{ell} \leq \sigma \\ 0 & \text{otherwise} \end{cases}$$

A filled disc of constant brightness with radius $\sigma$. The axis ratio $q$ is fixed at 1 (always circular), so $r_\text{ell}$ reduces to the ordinary Euclidean radius.

### Point source

A mathematically point-like source for simulating quasars or other compact objects. The source position $(c_x, c_y)$ is specified in the source plane; the simulator finds all image positions $\{\theta_i\}$ by solving the lens equation $\beta(\theta) = (c_x, c_y)$ numerically, then draws a circle of fixed angular radius $\sigma$ at each $\theta_i$ in the image plane.

Image positions are found via a two-stage algorithm: a coarse grid search using sign-change topology to locate starting guesses, followed by Newton–Raphson refinement with backtracking line search until $\lvert F(\theta)\rvert^2 \lt 10^{-14}$ arcsec². Each converged solution is deduplicated. Because the circles are drawn in the image plane with fixed size, they are not stretched or sheared by lensing — this is appropriate for modelling the PSF-limited appearance of a quasar image.

> Einstein rings and arc-shaped images do not appear in this mode. Use a Gaussian or uniform circle source for extended-emission lensing. Highly demagnified images (such as the central odd image of an SIE lens) may be missed by the grid search.

### Pasted image

A user-pasted image is uploaded to the GPU as a WebGL texture.
At each pixel, $\boldsymbol{\beta}$ is converted to UV coordinates centred on $(c_x, c_y)$ spanning $\pm\tfrac{\text{fov}}{2}$ arcsec, and the texture is sampled with bilinear interpolation.

### Compositing and tone mapping

Contributions from all source objects across all planes are summed per pixel to give a linear intensity $I \in [0,\infty)$.
Hidden objects contribute nothing to the sum, nor to deflection or critical curve computation.
The sum is clamped to $[0,1]$ and passed through a tone-mapping curve before display.

The dynamic range of astrophysical sources (bright ring core to faint extended arcs) far exceeds what a monitor can show linearly, so a nonlinear stretch is applied. Four options are available:

| Mode | Formula | Parameter | Character |
|---|---|---|---|
| Linear | $\text{out} = I$ | — | No stretch. Faint arcs invisible; bright cores sharp. |
| Square root | $\text{out} = \sqrt{I}$ | — | Moderate fixed stretch ($\gamma = 0.5$). Default. |
| Power law | $\text{out} = I^\gamma$ | $\gamma \in [0.1,\,1]$ | Generalises square root. Lower $\gamma$ lifts faint emission more aggressively. |
| Asinh | $\text{out} = \operatorname{asinh}(aI)\,/\,\operatorname{asinh}(a)$ | $a \in [0.5,\,20]$ | Near-linear at low $I$, logarithmic at high $I$. Used by SDSS, HST, and modern survey pipelines (Lupton et al. 2004). Larger $a$ gives a stronger stretch. |

All modes satisfy $f(0)=0$ and $f(1)=1$, so the output always spans $[0,1]$.

---

## 6. Critical curves and caustics

**Critical curves** are contours in the image plane where $\det(\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}) = 0$.
Sources near a critical curve are highly magnified and stretched into arcs.
Their pre-images in the source plane are the **caustics**; crossing a caustic changes the image count by two.

The computation proceeds in four steps:

1. **Sample a ray grid.** Trace $N \times N$ rays (Resolution dropdown, default $N = 512$) to the chosen source plane using the multiplane recursion, recording $\boldsymbol{\beta}$ at each image-plane point.

2. **Compute the Jacobian.** At each interior grid point, approximate the $2\times2$ Jacobian $\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}$ via central finite differences and compute its determinant.

3. **Find zero-crossings.** Apply marching squares: for each $2\times2$ cell, linearly interpolate zero-crossings on edges where the determinant changes sign. Each cell contributes one short segment; adjacent cells chain into smooth curves.

4. **Map to caustics.** Each critical-curve point is traced to the source plane by interpolating from the already-computed $\boldsymbol{\beta}$ grid.

> Fine features such as cusps are only resolved at higher resolutions.

---

## 7. Code structure

Caustica is written in vanilla JavaScript with no framework. The source lives in `/assets/caustica/`.

### `lens.js`

Pure physics; no DOM access or rendering.

- **Cosmology**: `comovingDist`, `angDiamDist`, `angDiamDistBetween` — flat ΛCDM distance integrals via midpoint Riemann sum.
- **Deflection models**: `deflectPointMass`, `deflectSIE`, `deflectEPL` — take a ray–lens separation in arcsec and return a deflection angle in arcsec.
- **`precomputeDistances(planes)`**: builds the $D_\text{obs}$ and $D_\text{btwn}$ arrays once per plane configuration.
- **`traceRay(θ, planes, dist, targetIdx)`**: evaluates the multiplane recursion in JavaScript; used for critical curve sampling.
- **`computeCriticalCurves(planes, dist, sourceIdx, fov, gridN)`**: samples an $N \times N$ ray grid, computes the Jacobian determinant via finite differences, then runs marching squares to extract critical curve and caustic segments.

### `renderer.js`

WebGL2 GPU renderer.

- A single **GLSL 300 es fragment shader** runs the full multiplane lensing computation per pixel: it re-implements the multiplane recursion, all lens deflection models, all source brightness profiles, and tone mapping entirely on the GPU.
- Scene data (plane redshifts, lens positions and parameters, source positions and parameters, pasted-image textures) are packed into uniform arrays and uploaded each frame.
- The `Renderer` class manages the WebGL context, shader compilation, geometry, and texture slots. `setScene(planes, dist, fov, toneMap, toneMapParam)` triggers a redraw.
- `preserveDrawingBuffer: true` is set on the WebGL context to allow screenshot and recording capture.

### `main.js`

Application shell (~2500 lines).

- **`state`**: single object holding all mutable app state — planes and their objects, selected IDs, display flags, add mode, tone-map settings, recording state.
- **`buildDOM()`**: constructs the entire UI tree in one pass (image panel, sidebar tabs, redshift axis, plane boxes area, toolbar, plane setup bar).
- **Event wiring**: `attachHandlers()` for global keyboard/tab/toolbar events; `attachAxisHandlers()` for plane-dragging on the redshift axis; `attachPlaneCanvasHandlers(canvas, plane)` per plane panel; `attachImageHandlers(wrap)` for drag-to-move in the main image.
- **`renderSidebar()`**: rebuilds the Object Controls and settings/recording tab content. Called whenever selection or state changes.
- **`rebuildPlaneBoxes()`**: rebuilds the plane panel DOM from scratch, called when planes are added or removed.
- **`_doRedraw()`**: packs the scene into the renderer, redraws the axis canvas, and redraws the overlay (critical curves, position markers, legend) on a 2D canvas layered above the WebGL output.
- **Recording**: `captureSnapshot()` composites the WebGL canvas and overlay into a PNG; `startRecording()` / `stopRecording()` drive a `MediaRecorder` for WebM or a gif.js encoder for GIF.
- **Programmatic recording**: each selected object can have an initial and final position set; `startProgrammaticRecording()` interpolates all registered objects simultaneously.
- **Config save/load**: `configToYaml()` serialises all planes and objects to a human-readable YAML string; `parseYamlConfig()` parses it back with strict type and range validation (allowlisted model names, hex-only color strings, bounded numeric coordinates) before updating state.
- **Tour**: `startTour()` / `showTourStep()` — spotlight-and-tooltip tutorial with mobile-aware step callbacks that open/close the plane setup drawer and switch mobile tabs as needed.

### `style.css`

Single stylesheet using CSS custom properties for theming (`--accent`, `--lens-color`, `--src-color`, `--hybrid-color`, and others) with `html[data-theme="dark"]` overrides.
The layout uses flexbox throughout: three-column on wide screens, collapsing to a single-column mobile layout with a fixed Plane Setup drawer at the bottom that slides up to reveal the redshift axis and plane panels.

### `gif.js` + `gif.worker.js`

A vendored local copy of the gif.js library.
Loaded lazily (only when GIF recording is requested) via a dynamic `<script>` tag, avoiding cross-origin Web Worker restrictions that would arise from a CDN-hosted copy.

---

## References

- Schneider, Ehlers & Falco (1992), *Gravitational Lenses*, Springer. *(Multiplane lensing formalism.)*
- Kormann, Schneider & Bartelmann (1994), Isothermal ellipsoidal mass distributions in gravitational lensing, A&A 284. *(SIE deflection angles.)*
- Blandford & Narayan (1986), Fermat surface, caustics, and the time delay between images, ApJ 310. *(Early multiplane treatment.)*
- Lupton, Blanton, Fekete et al. (2004), Preparing Red-Green-Blue Images from CCD Data, PASP 116. *(Asinh stretch for astronomical image display.)*
