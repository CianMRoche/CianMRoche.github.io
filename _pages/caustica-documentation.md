---
layout: doc
title: "How Caustica works"
permalink: /caustica-documentation/
---

[Caustica](/assets/caustica/) is a tool for easily visualizing strong gravitational lensing, named after the term used by 17th century mathematicians for the curves onto which refracted light rays converge, which were capable of burning objects.

<figure class="doc-fig-wide">
  <img class="img-light" src="/images/caustica-docs/ui-light.png" alt="The Caustica interface: lensed-image panel, redshift timeline, and control tabs.">
  <img class="img-dark"  src="/images/caustica-docs/ui-dark.png"  alt="The Caustica interface: lensed-image panel, redshift timeline, and control tabs.">
  <figcaption>The Caustica interface recreating a zigzag lens configuration. The image panel shows the lensed view; the redshift timeline below it and the Scene tab on the right hold the lens and source objects.</figcaption>
</figure>

<div class="doc-cyan" markdown="1">
Caustica was built with heavy use of AI tools for code generation, and as a whole its calculations have not been peer-reviewed or independently validated. Where a component was cross-checked against an established reference it is noted in the relevant section (for example, the EPL lens was ported from and validated against [lenstronomy](https://github.com/lenstronomy/lenstronomy); see §5). It is intended for education, intuition-building, visualization and media creation only, and should not be relied on for research.
</div>

## Quick start

1. **Click the redshift timeline** (the axis under the image) to add an empty plane. Plane markers sit on the axis itself (stacking upward only when they would overlap); drag one to reposition it, and click one to select that plane — the selected marker carries a ring and a bold redshift label. The **z<sub>max</sub>** field at the axis's right end sets its range.
2. **Pick a creation tool** in the plane viewer (or press 1 / 2 / 3): Lens (deflects light), Source (emits light), or Hybrid (both at once, shown as a purple dot). There is no separate select tool: click the highlighted tool again (or press **Esc**) to switch it off, and with no tool active a click or tap only selects and drags, so you can move objects around without risking creating a new one.
3. **Click the plane viewer** to place an object of the chosen type in the selected plane at that sky position, then drag to fine-tune, either in the viewer or on the main image (the main image never creates objects, so clicks there are always safe). The viewer shows the selected plane's true (unlensed) positions: the **L / S / H** tools and a trash button run down its left side, the **‹ ›** arrows flank the canvas (the **[** / **]** keys and, on touch, a horizontal swipe not starting on an object also step through the planes), and a **Redshift** box sits at the top right, with labelled **Clear** (clear all objects) and **Delete** (delete plane) buttons under a "Plane:" heading at the bottom right. On desktop the plane viewer is pinned to the bottom of the control rail so it stays visible under every tab, and the tab holding the object parameters is labelled **Object**. On phones the viewer moves into its own **Scene** tab alongside the redshift timeline, the object parameters keep a separate **Object** tab, and the right-side controls compact to keep the plane canvas large.
4. **Adjust parameters** in the Scene tab on the right. For hybrid objects, separate collapsible sections appear for the lens and source halves, each with its own show/hide (eye) and delete buttons, so a single half can be toggled or removed while the other stays. The eye button excludes an object from the computation without deleting it. Copy the selected object with **Cmd/Ctrl+C** and paste a duplicate in the same place with **Cmd/Ctrl+V**. Scene edits — adding, moving, deleting, and adjusting objects and planes — can be reversed with the **undo/redo arrows** to the right of the title (or **Cmd/Ctrl+Z** and **Cmd/Ctrl+Shift+Z**); view settings such as field of view and colour mapping are not part of the undo history.
5. **The image panel** updates in real time. Press C to overlay critical curves and caustics (the chips beside the view dropdown toggle the same overlays). **Zoom** with the mouse wheel or a two-finger pinch; the **scale bar** at the bottom right of the image tracks the angular scale as you zoom (1″, 2″, 5″, or 10″ depending on the field of view), and the View tab accepts an exact FOV value. On touch screens, a **horizontal swipe** across empty image space cycles the displayed view (the lensed image and each quantity map, wrapping around); vertical swipes still scroll the page, and touching an object still drags it. The View tab's **Hide all overlays** switch blanks the labelling annotations (position markers, legend, ruler, scale bar) and the on-canvas controls for a clean plot until switched back; critical curves and caustics stay, since they are lensing structure rather than labels (toggle those off separately if you want them gone). Use the **Export** tab to save a PNG, WebM, or GIF.
6. **Measure angular distances** with the ruler. The ruler is off by default: enable it with the **Ruler** toggle in the View tab, or just press **L** (which enables and arms it in one step). Its button sits at the bottom-left of the image panel; click it or press **L** to arm it, then click-and-drag on the image between two points: a line appears with its separation in arcseconds and position angle (e.g. `1.42″ · 34°`). Each new measurement becomes the selected item, and measurements are editable: click one to select it, drag its line to move it, or drag an endpoint to reshape it. Delete the selected measurement with its **trash** button or **Backspace**; clear all of them with the **×** button. Measurements persist when you toggle the ruler off. The measurement lines are captured in saved PNGs and recordings; the ruler buttons themselves are not.
7. **Save and load configurations** using the Save / Load buttons in the top bar, next to the preset dropdown (on phones they move into the top bar's **⋯** overflow menu, which also holds Docs, Tour, the shortcut reference, and the theme toggle, keeping undo / redo and presets on a single row). The file stores all planes, objects, and parameters along with the full view state, so a loaded config reproduces the same picture: field of view, active quantity, per-quantity color mapping, contour spacing, the critical-curve resolution, point-source grid density, and render scale, and the overlay and ruler toggles. Any setting absent from a file loads at its default value.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` / `2` / `3` | Toggle the plane-viewer tool: Lens / Source / Hybrid (click the viewer to place) |
| `C` | Toggle critical curves and caustics |
| `I` | Show lensed image (exit any quantity map) |
| `K` | Convergence κ map |
| `G` | Shear γ map |
| `M` | Magnification \|μ\| map |
| `A` | Deflection \|α\| map |
| `T` | Fermat potential φ contour map |
| `H` | Hide / show the selected object |
| `O` | Clear all objects from the selected plane |
| `X` | Delete the selected plane |
| `[` / `]` | Select the previous / next plane (along the z-sorted plane list) |
| `R` | Start / stop live recording |
| `L` | Toggle ruler mode (arm / disarm the ruler) |
| `D` | Toggle dark / light theme |
| `?` | Show the in-app keyboard-shortcut overlay |
| `Cmd/Ctrl` + `C` / `V` | Copy the selected object / paste a duplicate in place |
| `Cmd/Ctrl` + `Z` / `Shift`+`Z` | Undo / redo the last scene edit |
| `↑ ↓ ← →` | Nudge selected object (hold for acceleration) |
| `Delete` / `Backspace` | Delete the selected object, or the selected ruler measurement |
| `Escape` | Deselect the selected ruler, else disarm the ruler tool, else switch off the active plane-viewer tool, else deselect the object |

## 1. Coordinate system

All angular positions are measured in **arcseconds** (″): object coordinates $(c_x, c_y)$, deflection angles, and size parameters all use this unit.
The image panel shows a square patch of sky of side *field of view* `fov` (default 4″), centred on the optical axis. A **scale bar** at the bottom right of the image shows a round angular length (1″ for fov ≤ 6″, 2″ up to 10″, 5″ up to 30″, 10″ beyond), togglable in the View tab and included in captures.
Radians appear only in intermediate formulae and are converted back to arcseconds throughout.

### Measuring with the ruler

To read an angular separation directly off the image, enable the ruler (it is off by default) with the **Ruler** toggle in the View tab, or press **L**, which enables and arms it in one step; once enabled, the button at the bottom-left of the image panel (just above the colorbar, when one is shown; or **L**) toggles arming. With the tool armed, click and drag between any two points: the line's length is reported in arcseconds and its **position angle**, measured counter-clockwise from the positive $x$-axis (rightward) with $y$ increasing upward, as `distance″ · angle°`.

Endpoints are stored in sky coordinates, so a measurement stays anchored to the same points (and its readout stays constant) as you change the field of view. Measurements are additive: each drag adds another line, and the newest one becomes selected. A committed measurement is a first-class object: click it to select it, drag its line to move it, or drag either endpoint to reshape it. Only one thing (a measurement or an object) is selected at a time. Delete the selected measurement with the **trash** button next to the ruler or with **Backspace**; the **×** button clears all of them. Measurements persist when you toggle the ruler off (**Esc** first deselects the current measurement, then disarms the tool). The ruler lines are drawn on the same overlay as the markers and critical curves, so they appear in saved PNGs and recordings; the ruler buttons, being ordinary UI chrome, are excluded from both.

## 2. Cosmological distances

The simulation uses a spatially flat ΛCDM cosmology. $H_0$ and $\Omega_m$ are adjustable in the Settings tab (the gear icon); the universe is kept flat, so $\Omega_\Lambda = 1 - \Omega_m$. Defaults:

| Symbol | Default | Meaning |
|---|---|---|
| $H_0$ | 70 km s⁻¹ Mpc⁻¹ | Hubble constant (adjustable, 50–100) |
| $\Omega_m$ | 0.3 | Matter density parameter (adjustable, 0.05–0.6) |
| $\Omega_\Lambda$ | $1 - \Omega_m$ | Dark-energy density parameter (flat universe) |
| $c$ | $2.998\times10^5$ km s⁻¹ | Speed of light |

Because the lensed image, the $\kappa/\gamma/\mu$ maps, and the critical curves depend only on ratios of angular-diameter distances, $H_0$ leaves them unchanged and only $\Omega_m$ shifts them. $H_0$ does set the absolute distance scale, so it rescales the physical time delays (§4): the delays scale as $1/H_0$, which is the basis of time-delay cosmography.

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

## 3. Multiplane lensing recursion

Planes are sorted by increasing redshift.
A ray **observed** at image-plane angle $\boldsymbol{\theta}$ (a 2-D vector in arcsec) is traced forward through each plane in order.
Its angular position at plane $j$ is given by the *multiplane recursion* (Schneider, Ehlers & Falco 1992):

<div class="doc-key" markdown="1">
**Multiplane recursion**

$$\boldsymbol{\theta}_j \;=\; \boldsymbol{\theta} \;-\; \sum_{k\,<\,j} \frac{D_{kj}}{D_j}\;\hat{\boldsymbol{\alpha}}_k\left(\boldsymbol{\theta}_k\right)$$
</div>

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

<div class="doc-note" markdown="1">
**Key idea.** Because each lens plane evaluates its deflection at the ray's *already-deflected* position $\boldsymbol{\theta}_k$, successive lens planes interact non-linearly, a key feature of multiplane lensing absent in single-plane calculations.
</div>

<div class="doc-figpair">
  <figure class="figpair-main">
    <img class="img-light" src="/images/caustica-docs/multiplane-light.png" alt="Two lens planes at different redshifts bending light from a background source into arcs.">
    <img class="img-dark"  src="/images/caustica-docs/multiplane-dark.png"  alt="Two lens planes at different redshifts bending light from a background source into arcs.">
    <figcaption>A two-lens-plane configuration: lenses at z = 0.4 and z = 0.8 deflect light from a source at z = 1.6, the two deflections compounding non-linearly.</figcaption>
  </figure>
  <figure class="figpair-side">
    <img class="img-light" src="/images/caustica-docs/plane-timeline-light.png" alt="Redshift timeline showing two lens planes and a source plane as draggable markers.">
    <img class="img-dark"  src="/images/caustica-docs/plane-timeline-dark.png"  alt="Redshift timeline showing two lens planes and a source plane as draggable markers.">
    <figcaption>The plane controls for the same scene: each plane is a marker on the redshift timeline (observer at z = 0), draggable to set its redshift. Objects are added to the selected plane.</figcaption>
  </figure>
</div>

## 4. Lensing quantities

The **lensing-quantities view** (dropdown in the top-right of the image panel) visualises several quantities derived from the lens mapping at the chosen source redshift $z_s$.

### The lens mapping Jacobian

For each image-plane position $\boldsymbol{\theta}$, the multiplane recursion maps it to a source-plane position $\boldsymbol{\beta}(\boldsymbol{\theta})$.
The $2\times2$ Jacobian matrix of this mapping is:

$$A_{ij} = \frac{\partial\beta_i}{\partial\theta_j}$$

Caustica approximates each element using central finite differences with step $h = 0.004\times\text{fov}$:

$$A_{11} \approx \frac{\beta_x(\boldsymbol{\theta}+h\hat{e}_x) - \beta_x(\boldsymbol{\theta}-h\hat{e}_x)}{2h}, \quad \text{etc.}$$

Four Jacobian-derived quantities are available:

| Quantity | Formula | Notes |
|---|---|---|
| Convergence $\kappa$ | $1 - \tfrac{1}{2}(A_{11}+A_{22})$ | Dimensionless projected mass density scaled by the critical surface density. $\kappa=0$ in empty space; the *mean* convergence enclosed within the Einstein radius is $\bar\kappa=1$ (the local $\kappa$ on the ring is smaller, e.g. $0.5$ for an SIS and $0$ for a point mass). |
| Shear $\gamma$ | $\sqrt{\gamma_1^2+\gamma_2^2}$, where $\gamma_1=\tfrac{1}{2}(A_{22}-A_{11})$, $\gamma_2=-\tfrac{1}{2}(A_{12}+A_{21})$ | Tidal distortion; zero for a circularly symmetric lens at its centre. |
| Magnification $\mu$ | $1/\lvert\det A\rvert$ | Ratio of image to source solid angle; diverges on critical curves. Log colour scale over $\mu \in [1, 30]$ by default (adjustable). |
| Deflection $\lvert\hat{\boldsymbol{\alpha}}\rvert$ | $\lvert\boldsymbol{\theta} - \boldsymbol{\beta}(\boldsymbol{\theta})\rvert$ | Total accumulated deflection angle in arcseconds from observer to source plane. Linear colour scale over $[0, 2]$″ by default (adjustable). |

<div class="doc-figrow">
  <figure>
    <img class="img-light" src="/images/caustica-docs/kappa-light.png" alt="Convergence map of a compound lens.">
    <img class="img-dark"  src="/images/caustica-docs/kappa-dark.png"  alt="Convergence map of a compound lens.">
    <figcaption>Convergence κ</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/gamma-light.png" alt="Shear map of a compound lens.">
    <img class="img-dark"  src="/images/caustica-docs/gamma-dark.png"  alt="Shear map of a compound lens.">
    <figcaption>Shear γ</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/mu-light.png" alt="Magnification map of a compound lens.">
    <img class="img-dark"  src="/images/caustica-docs/mu-dark.png"  alt="Magnification map of a compound lens.">
    <figcaption>Magnification |μ|</figcaption>
  </figure>
</div>
<figcaption style="text-align:center">Convergence, shear, and magnification maps for the same compound lens (a main galaxy with an an off-centre companion), at source redshift z<sub>s</sub>=1.5.</figcaption>

### Distance weighting and the effective shear

In the multiplane recursion, a lens at plane $k$ contributes to $A$ with weight $D_{kj}/D_j$, where $j$ indexes the source plane.
As a result, the **effective** shear and convergence seen in the map are attenuated relative to the model parameter:

$$\gamma_\text{eff} = \gamma_\text{input} \cdot \frac{D_{ls}}{D_s}, \qquad \kappa_\text{eff} = \kappa_\text{input} \cdot \frac{D_{ls}}{D_s}$$

For example, an external shear with $\gamma_\text{input} = 0.5$ placed at $z_l = 0.5$ with $z_s = 1.0$ will show $\gamma_\text{eff} \approx 0.21$ in the map, because $D_{ls}/D_s \approx 0.42$ for those redshifts.
The map value equals the input value only in the limiting case $z_l \to 0$, where $D_{ls}/D_s \to 1$.

This is the physically correct behaviour: the same lens produces weaker effective lensing when placed closer to the observer relative to the source.

### Numerical accuracy near singular profiles

The finite-difference Jacobian is accurate everywhere except very close to singular or steep profiles (point mass, EPL with large $\gamma'$), where the deflection angle varies as $\sim 1/r$ or faster.
Near such singularities the truncation error of the central-difference scheme can produce small spurious structure in the $\kappa$ map; convergence is clamped to zero in the display to suppress the most prominent artefacts.
The shear and magnification maps are less affected.

### Colour scale, limits, and palette

The $\kappa$, $\gamma$, $\lvert\mu\rvert$, and $\lvert\hat{\boldsymbol{\alpha}}\rvert$ maps share a set of controls in the **Color Map** section of the View tab. Each map remembers its own settings. The reference source redshift these maps use is set by the **z<sub>s</sub> ref** control in the View tab's Display section (Auto tracks the highest source plane; a chip on the image shows the value in use), and quick toggles for critical curves, caustics, and markers sit beside the view dropdown on the image itself.

A raw quantity value $v$ is mapped to a colour in two steps: first warped to a normalised position $t \in [0,1]$ between the chosen limits, then passed through the selected colour palette.

- **Min / Max** set the data values mapped to the two ends of the colour bar; values outside are clamped. Each field can be typed, nudged with the spinner (whose step scales to the value's magnitude), or **dragged left/right to scrub** continuously.
- **Scale** chooses the warp from value to colour:

| Scale | Mapping | Notes |
|---|---|---|
| Linear | $t = \dfrac{v - \text{min}}{\text{max}-\text{min}}$ | Proportional. |
| Square root | $t = \sqrt{u}$ | Expands low values. |
| Log | $t = \dfrac{\ln v - \ln\text{min}}{\ln\text{max} - \ln\text{min}}$ | True logarithmic axis; needs $\text{min} > 0$. Default for $\lvert\mu\rvert$. |
| Power law | $t = u^{\gamma}$, $\gamma \in [0.1, 2]$ | $\gamma < 1$ brightens low values; $\gamma > 1$ emphasises high values. |
| Asinh | $t = \operatorname{asinh}(a\,u)/\operatorname{asinh}(a)$, $a \in [0.5, 20]$ | Linear near the bottom, logarithmic at the top. |

(where $u = (v-\text{min})/(\text{max}-\text{min})$ clamped to $[0,1]$).

- **Colormap** selects the palette: **Default** (theme-aware purple→orange→yellow), **Viridis**, **Inferno**, **Plasma**, **Turbo**, or **Grayscale**. The standard palettes are evaluated on the GPU via compact polynomial fits and are theme-independent.
- **Colorbar** (in the View tab's Display section) toggles the on-canvas colour bar, which is labelled with the current Min/Max (at most two decimal places). It has no on-image chip, since the bar itself is the obvious place to notice it is on.

A small ⓘ button in the section header summarises whichever controls are currently shown; the header itself expands and collapses the section, as does the **Background** section (§7). Both start collapsed. The same Min/Max/Scale machinery also drives the brightness stretch of the lensed-image view (§6).

<div class="doc-figrow">
  <figure>
    <img class="img-light" src="/images/caustica-docs/cmap-default-light.png" alt="Magnification map with the Default palette.">
    <img class="img-dark"  src="/images/caustica-docs/cmap-default-dark.png"  alt="Magnification map with the Default palette.">
    <figcaption>Default</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/cmap-viridis-light.png" alt="Magnification map with the Viridis palette.">
    <img class="img-dark"  src="/images/caustica-docs/cmap-viridis-dark.png"  alt="Magnification map with the Viridis palette.">
    <figcaption>Viridis</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/cmap-turbo-light.png" alt="Magnification map with the Turbo palette.">
    <img class="img-dark"  src="/images/caustica-docs/cmap-turbo-dark.png"  alt="Magnification map with the Turbo palette.">
    <figcaption>Turbo</figcaption>
  </figure>
</div>
<figcaption style="text-align:center">The same compound-lens |μ| map under three palettes, log scale over the same limits.</figcaption>

### Fermat potential

The **Fermat potential** (also called the arrival-time surface) maps each image-plane position $\boldsymbol{\theta}$ to the light-travel time relative to an undeflected path, for a source at a fixed position $\boldsymbol{\beta}_s$ in the source plane. Caustica builds the full multiplane arrival-time surface in **comoving transverse coordinates** $\boldsymbol{\eta}_j = \chi_j\,\boldsymbol{\theta}_j$, where $\chi_j$ is the comoving distance to plane $j$ and $\boldsymbol{\theta}_j$ is the ray's angular position there. The surface sums geometric path-length terms over a reduced sequence of nodes (the observer, each **lens** plane, and the source) minus the lensing potentials:

<div class="doc-key" markdown="1">
**Fermat (arrival-time) surface**

$$\varphi(\boldsymbol{\theta};\boldsymbol{\beta}_s) = \frac{1}{K}\left[\;\sum_{\text{segments}} \frac{1}{2}\,\frac{\lvert\boldsymbol{\eta}_{j+1} - \boldsymbol{\eta}_j\rvert^2}{\chi_{j+1} - \chi_j} \;-\; \sum_{\text{lens planes } k} \chi_k\,\psi_k(\boldsymbol{\theta}_k)\;\right]$$
</div>

The node sequence runs observer $(\chi=0,\,\boldsymbol{\eta}=\mathbf{0}) \to$ each lens plane $(\chi_k,\,\boldsymbol{\eta}_k) \to$ source $(\chi_s,\,\boldsymbol{\eta}_s = \chi_s\boldsymbol{\beta}_s)$, with the final node **pinned** to the fixed source position $\boldsymbol{\beta}_s$ rather than the traced one. The normalisation $K = \chi_L\,\chi_s/(\chi_s - \chi_L)$, with $\chi_L$ the comoving distance to the first lens plane, rescales the surface so that the single-plane case reduces exactly to the textbook $\tfrac{1}{2}\lvert\boldsymbol{\theta}-\boldsymbol{\beta}_s\rvert^2 - \psi$ and the contour field stays of order unity. $\psi_k$ is the analytic lensing potential of plane $k$ (table below), evaluated at the ray's position $\boldsymbol{\theta}_k$.

Two properties make this the physically correct surface, and distinguish it from a naïve single-plane generalisation.

**Empty planes do nothing.** Between deflections a ray drifts in a straight comoving line, so planes containing no lens are skipped entirely. Inserting or moving an empty plane therefore leaves $\varphi$ unchanged. A formula written in angular rather than comoving coordinates fails this test, because the $(1+z)$ factors in the angular diameter distances do not cancel.

**Stationary points are images.** With the source node pinned, the gradient of the arrival-time surface is

$$\nabla_{\boldsymbol{\theta}}\,\varphi = \boldsymbol{\beta}(\boldsymbol{\theta}) - \boldsymbol{\beta}_s ,$$

which vanishes exactly where the traced source position $\boldsymbol{\beta}(\boldsymbol{\theta})$ equals the fixed source position, the image positions. The relative time delay between two images is proportional to their difference in $\varphi$.

By default $\boldsymbol{\beta}_s = 0$ (source at the coordinate origin). When the **Use last selected source** checkbox in the Fermat Potential settings section (shown only in this mode) is enabled, the position and source-plane redshift of the most recently selected source object are used instead, so the arrival-time surface and image markers reflect the actual source being lensed.

<div class="doc-figrow doc-figrow-wide">
  <figure>
    <img class="img-light" src="/images/caustica-docs/fermat-light.png" alt="Fermat arrival-time contour map with image-position markers.">
    <img class="img-dark"  src="/images/caustica-docs/fermat-dark.png"  alt="Fermat arrival-time contour map with image-position markers.">
    <figcaption>Arrival-time surface: iso-φ contours with the image markers (I, II, III) at its stationary points.</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/fermat-images-light.png" alt="The same lens with a uniform disc source, showing the lensed images.">
    <img class="img-dark"  src="/images/caustica-docs/fermat-images-dark.png"  alt="The same lens with a uniform disc source, showing the lensed images.">
    <figcaption>The same lens with a uniform disc source: each lensed image lands exactly on a stationary point at left.</figcaption>
  </figure>
</div>
<figcaption style="text-align:center">Images form at stationary points of the arrival-time surface. Left: the surface and its markers. Right: the actual lensed light of a uniform disc source at the same positions.</figcaption>

#### Image type classification

The nature of each stationary point is determined by the Jacobian $A$ at that location:

| Type | Criterion | Character |
|---|---|---|
| I (minimum) | $\det A > 0$ and $\kappa < 1$ | The arrival time is a local minimum; the image has positive parity. |
| II (saddle) | $\det A < 0$ | The arrival time is a saddle point; the image has negative parity. |
| III (maximum) | $\det A > 0$ and $\kappa > 1$ | The arrival time is a local maximum; the image has positive parity. The central de-magnified image of an SIE belongs here. |

By Morse theory, for a source inside all caustics the image count follows the sequence I, II, I, II, III (for a standard galaxy lens), giving a total of an odd number. The difference (number of minima + maxima) minus (number of saddles) equals $+1$ for a simply connected lens.

#### Display

The map shows iso-$\varphi$ contour lines computed analytically per pixel in the fragment shader. The default contour spacing is $0.002\,\text{fov}^2$ arcsec², adjustable with the **Spacing** control in the Fermat Potential section of the View tab (a multiplier of this default, available whenever the Fermat map is shown). Because the spacing scales with the field of view, the contour density stays similar as you zoom. Contours fade toward the edge of the field. The contour passing through each Type II (saddle) image is drawn thicker and brighter because it separates distinct image regions on the arrival-time surface, and this highlight tracks the chosen spacing. Stationary point positions are overlaid as markers (circle for Type I, diamond for Type II, triangle for Type III) with a type legend in the lower right.

#### Lensing potentials by model

The potential $\psi_k$ is computed analytically where a closed form exists:

| Model | $\psi$ |
|---|---|
| Point mass | $b^2 \ln r$ |
| SIE / NIE | $\displaystyle\frac{bq}{\sqrt{1-q^2}}\left[x_r\arctan\frac{\sqrt{1-q^2}\,x_r}{r_e+s} + y_r\operatorname{arctanh}\frac{\sqrt{1-q^2}\,y_r}{r_e+q^2 s}\right]$ |
| External shear | $\tfrac{\gamma}{2}\left[(\theta_x^2-\theta_y^2)\cos 2\varphi + 2\theta_x\theta_y\sin 2\varphi\right]$ |
| External convergence | $\tfrac{\kappa}{2}\lvert\boldsymbol{\theta}\rvert^2$ |
| Constant deflection | $\alpha(\theta_x\cos\varphi + \theta_y\sin\varphi)$ |
| EPL | $\tfrac{1}{2-t}\,(\mathbf{u}\cdot\hat{\boldsymbol{\alpha}}_\text{EPL})$, with $t=\gamma'-1$ (see §5, EPL) |

The EPL potential is the exact Tessore & Metcalf (2015) form $\psi = \tfrac{1}{2-t}(\mathbf{u}\cdot\hat{\boldsymbol{\alpha}})$, a true gradient field, so the Fermat surface and image classification derived from it are self-consistent. It is singular only at $\gamma'=3$ (where the profile's potential is logarithmic), which is guarded numerically.

#### Gauge note

The zero level of $\varphi$ has no absolute physical meaning; it depends on the normalisation convention. For a singular isothermal sphere with deflection scale $b$ and source at the origin (taking $D_{LS}/D_S = 1$, so the Einstein ring sits at $r = b$), $\varphi(\boldsymbol{\theta};0) = 0$ at $r = 0$ and $r = 2b$, not at the Einstein ring ($r = b$). What is physically meaningful is the **difference** in $\varphi$ between two images, which is proportional to the relative time delay between those images.

#### Time delays (days)

The **Time delays** toggle in the View tab labels each point-source image with its arrival time in days, relative to the first-arriving image (the global minimum of the arrival-time surface). The delay between two images is their difference in arrival time:

$$\Delta t_{ij} = \frac{K}{c}\,\big(\varphi_i - \varphi_j\big),\qquad K = \frac{\chi_L\,\chi_S}{\chi_S - \chi_L}$$

where $\varphi$ is the reduced Fermat potential from the box above (arcsec², converted to radians² in the code) and $K$ is its normalisation ($\chi_L$ is the first lens plane). For a single lens plane $K$ reduces to the **time-delay distance** $D_{\Delta t} = (1+z_L)\,D_L D_S / D_{LS}$, and the expression becomes the textbook single-plane result $\Delta t = (D_{\Delta t}/c)\,\Delta\varphi$.

The same formula holds for any number of lens planes, because the normalisation cancels: multiplying $\varphi$ back by $K$ recovers the raw comoving arrival time, so the delay depends only on the physical surface, not on the display scaling. Working in comoving coordinates is what keeps this simple, each $(1+z)$ factor is absorbed into the distances $\chi = (1+z)D$, since an excess comoving path length converts to observed time as length$/c$ (the proper-length contraction and cosmological dilation cancel).

Because $K \propto 1/H_0$, every delay scales inversely with the Hubble constant, while $\Omega_m$ shifts it through the distance ratios, and this sensitivity is exactly what time-delay cosmography exploits to measure $H_0$. The toggle needs at least one lens plane in front of the source and a point source with two or more images.

## 5. Lens deflection models

All models take the ray–lens separation $\mathbf{u} = \boldsymbol{\theta}_k - (c_x, c_y)$ (arcsec) and return a deflection angle $\hat{\boldsymbol{\alpha}}$ (arcsec).

Because the deflections are physical (the multiplane distance weights are applied separately), the strength parameters below are independent of any source. For the four mass models (point mass, SIE, NIE, EPL) a read-only **θ<sub>E</sub>** line at the bottom of the object controls reports the Einstein radius the selected lens alone would have for a source at the reference redshift $z_s$ (the same **z<sub>s</sub> ref** the critical curves and quantity maps use; View tab). With $w = D_{LS}/D_S$ it shows $b\sqrt{w}$ for the point mass, $b\,w$ for the isothermal models, and $b\,w^{1/(\gamma'-1)}$ for the EPL (circular-equivalent values; it reads — when the reference source is not behind the lens).

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

### NIE (Nonsingular Isothermal Ellipsoid)

The NIE is an SIE with a finite core radius $r_c > 0$, replacing the central density cusp with a finite core. The deflection formula is identical to the SIE with the softening radius $s$ set to the user-specified core radius instead of the numerical floor:

$$r_e = \sqrt{q^2(x_r^2 + r_c^2) + y_r^2}, \qquad s = r_c$$

All four SIE steps apply unchanged. The NIE has no critical curve at the origin and produces a finite central surface density $\Sigma_0 \propto b/r_c$, making it more physical for lenses with observed cores (e.g. galaxy clusters with brightest-cluster galaxies).

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), same role as in SIE |
| $q$ | Axis ratio $0 \lt q \leq 1$ |
| $\varphi$ | Position angle of major axis (radians) |
| $r_c$ | Core radius (arcsec); $r_c \to 0$ recovers the SIE |

### EPL (Elliptical Power Law)

A generalisation of the SIE in which the density slope is a free parameter, using the **exact** elliptical-power-law deflection of Tessore & Metcalf (2015). The projected surface density follows $\kappa(r_e) \propto r_e^{1-\gamma'}$, where $r_e$ is the elliptical radius and $\gamma'$ is the radial mass-density slope (written with a prime to distinguish it from the external-shear strength $\gamma$); $\gamma' = 2$ recovers the SIE exactly.

Unlike a naive "scaled SIE" (SIE deflection multiplied by a radial power), the Tessore form is a **true gradient field** for every axis ratio and slope, so its convergence and shear maps are self-consistent and it admits a closed-form potential (used by the Fermat surface). In the coordinate frame aligned with the major axis, writing $t = \gamma' - 1$ and the complex position $z = x_r + i\,y_r$, the deflection is

$$\alpha_x + i\,\alpha_y = \frac{2b'}{1+q}\left(\frac{b'}{R}\right)^{t-1}\Omega(\phi), \qquad R = \sqrt{q^2 x_r^2 + y_r^2}, \quad \phi = \arg(q\,x_r + i\,y_r)$$

where $b' = b\,q$ (chosen so the deflection matches Caustica's SIE scale $b$ at $\gamma'=2$) and the angular factor $\Omega(\phi)$ is summed from the Tessore recurrence

$$\Omega_0 = e^{i\phi},\qquad \Omega_n = \Omega_{n-1}\,\frac{2n-(2-t)}{2n+(2-t)}\left(-\frac{1-q}{1+q}\,e^{2i\phi}\right),\qquad \Omega=\textstyle\sum_n \Omega_n.$$

The series is truncated when a term falls below machine precision (up to 200 terms). The result is rotated back to the sky frame by the position angle. The closed-form potential is $\psi = \tfrac{1}{2-t}(\mathbf{u}\cdot\hat{\boldsymbol{\alpha}})$ (Euler's theorem, since $\psi$ is homogeneous of degree $2-t$), which reduces to the SIE potential $\mathbf{u}\cdot\hat{\boldsymbol{\alpha}}$ at $\gamma'=2$.

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), same role and normalisation as in the SIE |
| $q$ | Axis ratio $0 \lt q \leq 1$ (clamped to $\geq 0.05$ so the series converges) |
| $\varphi$ | Position angle of the major axis (radians) |
| $\gamma'$ | Radial mass-density slope ($\rho \propto r^{-\gamma'}$): $\gamma' = 2$ isothermal, $\gamma' \lt 2$ shallower central density, $\gamma' \gt 2$ steeper. Observed galaxies typically have $\gamma' \approx 1.9$–$2.1$. |

The implementation was ported from the [lenstronomy](https://github.com/lenstronomy/lenstronomy) `epl_numba` module and validated against Caustica's independent Kormann SIE at $\gamma'=2$ (agreement to the softening scale $\sim 10^{-3}$″), for vanishing curl of the deflection field ($\nabla\times\hat{\boldsymbol{\alpha}} \sim 10^{-8}$, confirming it is conservative), and for $\nabla\psi = \hat{\boldsymbol{\alpha}}$.

### External shear

Models the tidal field from mass not explicitly included as a lens plane (e.g. a galaxy cluster along the line of sight, or neighbouring structures). The deflection is linear in the observed angle $\boldsymbol{\theta}$, always evaluated relative to the coordinate origin:

$$\hat{\alpha}_x = \gamma_\text{ext}(\theta_x \cos 2\varphi + \theta_y \sin 2\varphi)$$

$$\hat{\alpha}_y = \gamma_\text{ext}(\theta_x \sin 2\varphi - \theta_y \cos 2\varphi)$$

This follows from the lensing potential $\psi = \tfrac{\gamma_\text{ext}}{2}\left[(\theta_x^2 - \theta_y^2)\cos 2\varphi + 2\theta_x \theta_y \sin 2\varphi\right]$.

| Symbol | Meaning |
|---|---|
| $\gamma_\text{ext}$ | Shear strength (dimensionless). Typical values 0.01–0.2 for galaxy-scale lenses. |
| $\varphi$ | Shear position angle (radians), aligned with the direction of the tidal field. |

The shear object's position in the plane card has no effect on the lensing computation; the deflection is always computed relative to the coordinate origin. The marker and direction arrow can be repositioned freely for visual organisation.

<div class="doc-note" markdown="1">
**Note.** The effective shear visible in the lensing-quantities map is $\gamma_\text{eff} = \gamma_\text{ext} \cdot D_{ls}/D_s$, not $\gamma_\text{ext}$ itself. See §4 for details.
</div>

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

This follows from the potential $\psi = \tfrac{\kappa}{2}\lvert\boldsymbol{\theta}\rvert^2$ and is isotropic, with no preferred direction.

| Symbol | Meaning |
|---|---|
| $\kappa$ | Convergence (dimensionless). Positive for overdense structures, negative for underdense voids. |

The object's position has no effect on the lensing. External convergence is related to the **mass sheet degeneracy**: a uniform sheet cannot be distinguished from a rescaling of all lens masses and source distances using image positions alone.

## 6. Source brightness models

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

<div class="doc-figrow">
  <figure>
    <img class="img-light" src="/images/caustica-docs/src-pointsource-light.png" alt="Point source lensed by an SIE into multiple images.">
    <img class="img-dark"  src="/images/caustica-docs/src-pointsource-dark.png"  alt="Point source lensed by an SIE into multiple images.">
    <figcaption>Point source</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/src-gaussian-light.png" alt="Gaussian source lensed by an SIE.">
    <img class="img-dark"  src="/images/caustica-docs/src-gaussian-dark.png"  alt="Gaussian source lensed by an SIE.">
    <figcaption>Gaussian</figcaption>
  </figure>
  <figure>
    <img class="img-light" src="/images/caustica-docs/src-pasted-light.png" alt="A pasted image lensed by an SIE.">
    <img class="img-dark"  src="/images/caustica-docs/src-pasted-dark.png"  alt="A pasted image lensed by an SIE.">
    <figcaption>Pasted image</figcaption>
  </figure>
</div>
<figcaption style="text-align:center">The same SIE lens acting on three source types: an idealised point source, a Gaussian blob, and a pasted image.</figcaption>

### Gaussian

$$I = A\exp\left(-\frac{r_\text{ell}^2}{2\sigma^2}\right)$$

The Show Shape ellipse is drawn at $r_\text{ell} = 2\sigma$.

### Exponential

$$I = A\exp\left(-\frac{r_\text{ell}}{\sigma}\right)$$

More extended than Gaussian; $\sigma$ is the exponential scale length. This is a Sérsic profile with $n=1$.

### Uniform disc

$$I = \begin{cases} A & r_\text{ell} \leq \sigma \\ 0 & \text{otherwise} \end{cases}$$

A filled ellipse of constant brightness with a sharp edge, using the same elliptical radius $r_\text{ell}$ as the other analytic sources. $\sigma$ is the semi-major-axis radius, $q$ the axis ratio ($q = 1$ gives a circle), and $\varphi$ the position angle of the major axis.

### Point source

A mathematically point-like source for simulating quasars or other compact objects. The source position $(c_x, c_y)$ is specified in the source plane; the simulator finds all image positions $\lbrace\theta_i\rbrace$ by solving the lens equation $\beta(\theta) = (c_x, c_y)$ numerically, then draws a circle of fixed angular radius $\sigma$ at each $\theta_i$ in the image plane.

Image positions are found via a two-stage algorithm: a coarse grid search using sign-change topology to locate starting guesses, followed by Newton–Raphson refinement with backtracking line search until $\lvert F(\theta)\rvert^2 \lt 10^{-14}$ arcsec². Each converged solution is deduplicated. Because the circles are drawn in the image plane with fixed size, they are not stretched or sheared by lensing; this is appropriate for modelling the PSF-limited appearance of a quasar image.

<div class="doc-warning" markdown="1">
**Heads up.** Einstein rings and arc-shaped images do not appear in this mode. Use a Gaussian or uniform disc source for extended-emission lensing. Highly demagnified images (such as the central odd image of an SIE lens) may be missed by the grid search.
</div>

The grid density used for image finding is set in the **Settings** tab (the gear icon) as **Point source**, the number of sample points across the field of view (Coarse 150, Medium 300, Fine 600, or Very fine 1200). Denser grids find images more reliably near caustics but are slower; the default is Medium (300). Because the count is fixed rather than an absolute angular spacing, the cost stays bounded as the field of view grows to cluster scale.

### Pasted image

A user-pasted image is uploaded to the GPU as a WebGL texture.
At each pixel, $\boldsymbol{\beta}$ is converted to UV coordinates centred on $(c_x, c_y)$ spanning $\pm\tfrac{\text{fov}}{2}$ arcsec, and the texture is sampled with bilinear interpolation.

### Compositing and brightness stretch

Contributions from all source objects across all planes are summed per pixel to give a linear intensity $I \in [0,\infty)$.
Hidden objects contribute nothing to the sum, nor to deflection or critical curve computation.
The sum is clamped to $[0,1]$ and passed through a nonlinear stretch before display.

The dynamic range of astrophysical sources (bright ring core to faint extended arcs) far exceeds what a monitor can show linearly, so the stretch is essential. In surface-brightness mode the **Color Map** section of the View tab is titled **Brightness stretch** and exposes the same machinery used for the quantity maps (§4), applied independently to each RGB channel:

- **Min / Max** (default $0$ and $1$): intensities at or below Min map to the background; at or above Max they saturate.
- **Scale**: Linear, Square root (default, $\gamma=0.5$), Log, Power law ($\gamma \in [0.1, 2]$; lower $\gamma$ lifts faint emission more aggressively), or Asinh ($a \in [0.5, 20]$; near-linear at low intensity, logarithmic at high, the stretch used by SDSS, HST, and modern survey pipelines, Lupton et al. 2004).

With the default Min/Max of $0$ and $1$ the Square root, Power law, and Asinh curves all satisfy $f(0)=0$ and $f(1)=1$, reproducing the classic tone-mapping curves exactly. The colour-palette dropdown is hidden in this mode, since the lensed image carries its own colour.

## 7. Background image

The **Background** section of the View tab (collapsed by default, like **Color Map** beside it) replaces the empty field behind the lensed image with an uploaded picture. It is a display backdrop rather than a physical object: it is not lensed, contributes nothing to any deflection, and appears in the plain lensed-image view only, since the quantity maps colour every pixel themselves and Line art paints its own opaque palette background.

The picture is uploaded to the GPU as a texture, sampled in the same fragment shader, and composited **underneath** the lensed light, using the source brightness itself as the backdrop's coverage:

$$I_\text{out} = \operatorname{clamp}\Big(I_\text{src}' + \beta_\text{bg} I_\text{bg}\,\big(1 - \max_c I_{\text{src},c}'\big),\ 0,\ 1\Big), \qquad I_\text{src}' = f(I_\text{src}),$$

where $f$ is the brightness stretch above, applied before the composite so it shapes only the lensed light and leaves the supplied image's own tones intact. A fully lit pixel hides the backdrop completely and an empty one shows it in full, so **Brightness** ($\beta_\text{bg} \in [0,2]$) fades the picture between the empty field ($0$) and its supplied tones ($1$), or past them, and cannot alter the lensed image itself.

<div class="doc-note" markdown="1">
**Why not a plain sum?** Simply adding $\beta_\text{bg} I_\text{bg}$ to every pixel is the physically natural composite (light behind the field adds to light from the source), but it makes the Brightness slider shift *every* pixel by the backdrop's value, and where the sum saturates it also un-clips arcs as the backdrop is dimmed, so the lensed image visibly changes with a control that is supposed to affect only the backdrop. Weighting by $1 - \max_c I'_{\text{src},c}$ keeps the source's own contribution untouched at every brightness setting; the backdrop still shows through partially lit pixels, as anything behind a semi-transparent layer must.
</div>

**Framing.** The image panel is always square, so a rectangular picture has to be framed. **Fit** picks the starting frame, then **Zoom** and **Offset X / Y** adjust it by hand. Writing $a = w/h$ for the image's aspect ratio, the fit sets how much of the texture the viewport spans on each axis:

| Fit | Span $(s_x, s_y)$ | Result |
|---|---|---|
| Cover (crop) | $\big(\min(1, 1/a),\ \min(1, a)\big)$ | Fills the square; the long axis is cropped. Default. |
| Contain (fit) | $\big(\max(1, 1/a),\ \max(1, a)\big)$ | Whole image visible; the remainder stays empty field. |
| Stretch | $(1, 1)$ | Exactly one image on each axis; distorts a non-square picture. |
| Tile (mirrored) | as Contain, wrapped | Whole image visible, mirror-repeated to fill the rest. |

**Zoom** $k$ divides the span, so a larger zoom shows less texture and magnifies the picture; the **offsets** pan by a fraction of the panel (a positive offset moves the image right or up). Sampling outside $[0,1]^2$, which a Contain fit or a zoom below the fit produces, falls back to the empty field rather than smearing the edge pixels, except under Tile, where the texture's mirrored wrap fills the plane instead. The screen-space sample point is therefore

$$\mathbf{uv} = \Big(\mathbf{v} - \tfrac{1}{2} - \tfrac{1}{2}\boldsymbol{\delta}\Big) \odot \frac{\mathbf{s}}{k} \;+\; \frac{1}{2},$$

with $\mathbf{v}$ the viewport UV, $\boldsymbol{\delta}$ the two offsets, and $\odot$ elementwise multiplication; the vertical component is then flipped, since a texture's first data row is the image's top.

**Anchoring.** By default the backdrop is fixed to the viewport: it fills the panel whatever the field of view, so zooming the lens does not zoom the sky behind it. **Zoom with FOV** anchors it to the sky instead, scaling the span by $\text{fov}/\text{fov}_0$ where $\text{fov}_0$ is the field of view frozen when the image was loaded (or when the option was switched on). The backdrop then magnifies along with the lensed image, at the cost of running out of pixels when zoomed far in.

<div class="doc-note" markdown="1">
**Light theme.** The image canvas is CSS-inverted in light theme so the lensed light reads dark on white, which would show a photograph as a negative. The shader therefore **pre-inverts** the picture, $I_\text{bg} \to 1 - I_\text{bg}$, cancelling the canvas inversion: the backdrop looks the same in either theme while every other plot element (arcs, overlay ink, source colours) still flips with the theme exactly as it did before. The inversion is applied before the brightness scale, so $\beta_\text{bg} = 0$ is the plain empty field in both themes (black in dark, white in light) rather than black in one and white in the other. PNG capture and video recording replicate the same inversion, so exports match the screen.
</div>

An **eye button** beside the upload and remove buttons takes the backdrop off the plot without unloading it, so a figure can be captured with and without it.

All seven controls round-trip through the config file (`bgFit`, `bgZoom`, `bgOffX`, `bgOffY`, `bgBright`, `bgSkyLock`, `bgHidden`), each validated on load: `bgFit` against the allowlist and the rest clamped to the ranges above, so a hand-edited file cannot push them out of bounds, and a file predating the feature simply falls back to the defaults. Images larger than 4096 px on their longest side are downscaled on load, since a backdrop is never displayed above canvas resolution.

A picture you upload yourself is not saved in the config, exactly as for pasted-image sources; nor is the sky-lock reference $\text{fov}_0$, which is re-frozen at the current field of view whenever an image loads. A config *can* name one of the backdrops shipped alongside the presets, through the optional `bgImage` key, which is how the **Image recreation** preset (§11) arrives with its own photograph in place. Loading a config with no `bgImage` drops a preset-supplied image but leaves a hand-uploaded one alone, so switching presets neither discards your own picture nor leaves the previous preset's behind.

## 8. Instrument Model

The **Instrument** section of the View tab resamples the lensed image onto a real telescope's detector. It is a measurement model, distinct from **Render scale** (§10), which sets how finely the sky is *computed* rather than how coarsely it is *sampled*, and it applies to the lensed-image view only.

**Pixel binning.** A detector pixel records the mean surface brightness over its solid angle, so each output pixel is an area average,

$$I_{jk} = \frac{1}{A_{jk}}\int_{A_{jk}} I(\boldsymbol{\theta})\,\mathrm{d}^2\boldsymbol{\theta},$$

evaluated as an $s \times s$ stratified sum over the rendered samples inside pixel $(j,k)$. Averaging, rather than point-sampling a coarser grid, is what conserves flux and stops thin arcs and point-source images aliasing. The grid is centred on the optical axis, as if the telescope had been pointed at the lens. With **Include PSF** the sky is convolved first and integrated over pixels second, the order a real observation applies them in.

<div class="doc-warning" markdown="1">
**Approximate Gaussians, not real PSFs.** The convolution is a circular Gaussian matched only at half maximum. The real profiles are Airy patterns with rings and diffraction spikes (JWST, HST, Euclid, Roman), Moffat-like seeing with much heavier wings (Rubin, HSC), or an AO core on a broad halo (MUSE, Keck, ELT). This **underestimates the wings** in every case, which is exactly where faint-arc detectability and lens-light subtraction live. It shows the scale of the blur, not a usable PSF model.
</div>

Pixel scales are published values, referenced per row. The FWHM column is **not** quoted from those references except the three marked †; the rest are approximations, to be replaced via **Custom** for anything quantitative.

| Instrument | Pixel (″) | FWHM approx. (″) | Reference for the pixel scale |
|---|---|---|---|
| JWST NIRCam short | 0.031 | 0.062 † | [JDox](https://jwst-docs.stsci.edu/), *NIRCam Overview* Table 1 — 0.031″/pix, "FWHM 2 pix at 2.0 µm" |
| JWST NIRCam long | 0.063 | 0.126 † | [JDox](https://jwst-docs.stsci.edu/), *NIRCam Overview* Table 1 — 0.063″/pix, "FWHM 2 pix at 4.0 µm" |
| JWST MIRI | 0.11 | 0.22 † | [JDox](https://jwst-docs.stsci.edu/), *MIRI Imaging* — 0.11″/pix, "FWHM 2 pix @ 6.25 µm", scaling as 2 pix × (λ/6.25 µm) above that |
| HST ACS/WFC | 0.05 | 0.10 — empirical delivered PSF (optics alone give $\approx$ 0.05, charge diffusion and drizzling broaden it) | [ACS Instrument Handbook](https://hst-docs.stsci.edu/acsihb) — WFC, 0.049″/pix |
| HST WFC3/IR | 0.128 | 0.15 — $1.03\lambda/D$ at 1.4 µm | [WFC3 Instrument Handbook](https://hst-docs.stsci.edu/wfc3ihb) — 0.13″/pix nominal, 0.1283″ measured |
| Euclid VIS | 0.10 | 0.17 — empirical, its image-quality requirement (optics alone $\approx$ 0.12) | Euclid Collaboration, *Euclid. II. The VIS instrument* — 0.1″/pix |
| Euclid NISP | 0.30 | 0.45 — empirical, set by the coarse 0.3″ sampling not diffraction | Euclid Collaboration, *Euclid. III. The NISP instrument* — 0.3″/pix |
| Roman WFI | 0.11 | 0.12 — $1.03\lambda/D$ at 1–1.5 µm | [Roman WFI documentation](https://roman.gsfc.nasa.gov/); Spergel et al. (2015), [arXiv:1503.03757](https://arxiv.org/abs/1503.03757) — 0.11″/pix |
| Rubin / LSST | 0.20 | 0.70 — empirical, median delivered seeing | [Ivezić et al. (2019), ApJ 873, 111](https://ui.adsabs.harvard.edu/abs/2019ApJ...873..111I/abstract) — LSSTCam, 0.2″/pix |
| Subaru HSC | 0.168 | 0.60 — empirical, typical survey seeing | Miyazaki et al. (2018), PASJ 70, S1; [HSC pages](https://www.naoj.org/Projects/HSC/) — 0.168″/pix |
| VLT MUSE (NFM) | 0.025 | 0.07 — AO core, $\approx 1.03\lambda/D$ in the red | [ESO MUSE User Manual](https://www.eso.org/sci/facilities/paranal/instruments/muse.html) — narrow-field mode, 25 mas spaxels (wide-field is 0.2″) |
| Keck NIRC2 (narrow) | 0.00994 | 0.055 — AO core, $1.03\lambda/D$ at 2.2 µm | [Keck NIRC2 pages](https://www2.keck.hawaii.edu/inst/nirc2/) — narrow camera, ~9.94 mas/pix pre-ship; recalibrated to 9.952 mas (Yelda et al. 2010) and 9.971 mas (Service et al. 2016) |
| ELT MICADO | 0.004 | 0.010 — AO core, $1.03\lambda/D$ at 1.6 µm | [ESO MICADO pages](https://elt.eso.org/instrument/MICADO/); Davies et al., MICADO SPIE series — 4 mas wide-field mode (a 1.5 mas zoom mode also exists) |

Apertures used above: JWST 6.5 m, HST and Roman 2.4 m, Euclid 1.2 m, Keck 10 m, ELT 39 m.

**On the two formulas.** A diffraction-limited FWHM is $\simeq 1.03\,\lambda/D$. The more familiar $1.22\,\lambda/D$ is a different quantity — the first Airy null, i.e. the Rayleigh criterion — about 19% larger, and overestimates a width.

The three † rows are JDox's own Nyquist statements, "FWHM 2 pix" at each instrument's design wavelength, and they bracket the formula: NIRCam's 0.062″ and 0.126″ at 2.0 and 4.0 µm sit 4% *below* $1.03\lambda/D$, while MIRI's 0.22″ at 6.25 µm sits 8% *above* it. So $1.03\lambda/D$ is good to under 10% either way, where $1.22\lambda/D$ would be 20% high throughout.

MIRI spans 5.6–25.5 µm, so one figure is especially rough there. JDox gives the scaling explicitly, FWHM $= 2\,\text{pix} \times (\lambda/6.25\,\text{µm})$ above 6.25 µm — that is 0.35″ at 10 µm and 0.90″ at 25 µm — so set those through **Custom** when the filter matters.

**On the selection.** Discovery surveys (Euclid, Roman, Rubin, HSC), resolved modelling (HST ACS/WFC and WFC3/IR, JWST NIRCam), and high resolution on individual systems (MUSE, Keck, ELT). **MIRI** is the weakest fit, used for lensed-source astrophysics rather than lens modelling.

**When it cannot be applied.** With $W$ the canvas width in computed pixels, the rendered samples spanning one detector pixel are $s = pW/\text{fov}$. Below $s = 2$ the detector samples the sky more finely than the shader computes it, so the model is **skipped** — the un-binned frame is then the honest picture — and a *Detector too high resolution* warning names only the levers that apply: reduce the field below $pW/2$, which always works and, since $s \propto 1/\text{fov}$, identifies a wide field as the hard case; try a higher **Render scale**, offered only when the display's pixel ratio exceeds what the current mode uses, as Auto already caps it at 2; or raise the **Pixel scale** above $2\,\text{fov}/W$, offered only for a **Custom** detector. The opposite corner is not an error: Rubin's 0.2″ pixels across a 1″ field leave five pixels, which is genuinely what Rubin delivers there.

**Implementation and config.** The scene renders into an offscreen framebuffer covering a slightly wider field (so every edge pixel is whole), is optionally blurred by two separable Gaussian passes, then binned onto the pixel grid on the way to the canvas. The first pass needs only $s$ samples per detector pixel, so a coarse detector on a small field is *less* work than an unbinned frame; framebuffers and post-process programs are built lazily. An **eye button** beside the dropdown takes the model off the plot without losing the selection, for flipping against the full-resolution image. Stored as `instrument`, `instrPixel` and `instrPsfFwhm` (consulted only for `custom`), `instrPsf` and `instrHidden`.

## 9. Critical curves and caustics

**Critical curves** are contours in the image plane where $\det(\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}) = 0$.
Sources near a critical curve are highly magnified and stretched into arcs.
Their pre-images in the source plane are the **caustics**; crossing a caustic changes the image count by two.

The computation proceeds in four steps:

1. **Sample a ray grid.** Trace $N \times N$ rays (the **Critical curves** resolution in the Settings tab, default $N = 512$) to the chosen source plane using the multiplane recursion, recording $\boldsymbol{\beta}$ at each image-plane point.

2. **Compute the Jacobian.** At each interior grid point, approximate the $2\times2$ Jacobian $\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}$ via central finite differences and compute its determinant.

3. **Find zero-crossings.** Apply marching squares: for each $2\times2$ cell, linearly interpolate zero-crossings on edges where the determinant changes sign. Each cell contributes one short segment; adjacent cells chain into smooth curves.

4. **Map to caustics.** Each critical-curve point is traced to the source plane by interpolating from the already-computed $\boldsymbol{\beta}$ grid.

<figure>
  <img class="img-light" src="/images/caustica-docs/crit-light.png" alt="Critical curves and caustics of a compound lens.">
  <img class="img-dark"  src="/images/caustica-docs/crit-dark.png"  alt="Critical curves and caustics of a compound lens.">
  <figcaption>Critical curves (image plane) and their caustics for a compound lens, toggled with the C key. The extra mass components merge and distort the curves well beyond the simple SIE case. A source crossing a caustic changes the image count by two.</figcaption>
</figure>

<div class="doc-note" markdown="1">
**Note.** Fine features such as cusps are only resolved at higher resolutions.
</div>

### Line art (vector render mode)

The **Line art** toggle in the View tab replaces the raster (WebGL) image with a flat, minimal **vector** rendering of the lensing structure, drawn entirely on the 2D overlay canvas. It is meant for clean, poster-style figures: filled and stroked lensed-image outlines, point-source image dots, and (following their own View-tab toggles) critical curves and caustics, in a chosen **palette**. The palettes are fixed looks (independent of the site's light/dark theme): **Default**, **Ink**, **Ink (inv.)**, **Crimson**, **Crimson (inv.)**, **Blueprint**, **Blueprint (inv.)**, **Espresso**, **Mint**, and **Noir**. **Default** is the one line art starts on: the dark-mode page background (`#0d1117`) behind the homepage hero blue (`#93c5fd`) for the images and critical curves, so a fresh line-art view matches the artwork on the front page, with the caustics picked out in the source marker's gold (`#fbbf24`). Below the palette dropdown, a **color picker for each role** (background, image fill, image line, critical, caustic, point image, and the lens / source / hybrid markers) lets you fine-tune any color after choosing a palette; re-selecting a palette resets them. The marker colors also drive the matching "show shape" outlines. Sharing that grid, in the cell directly below **Image fill**, is a **Fill alpha** box: the opacity of the lensed-image fill, from 0 (outline only) to 1 (solid), defaulting to 0.9. Like the other numeric fields in the app you can type into it or drag left/right across it to scrub. A **Fill** toggle switches between filled shapes and outline-only (greying out Fill alpha while off), and a **Smooth** toggle controls curve smoothing. The palette choice, any per-role overrides, and the fill alpha are saved in the config file. The section's **i** button explains what is drawn.

Line art is a **restyle** of the normal overlay, not a stripped-down separate view: the position markers, ruler, scale bar, and legend all remain visible exactly as before (per their own toggles), so switching line art on hides nothing. The raster image layer is simply replaced by the flat palette background plus the vector structure. Those remaining annotations take their color from **Annotation color** below rather than from the palette.

**Export.** Because line art draws to the overlay, PNG capture and recording pick it up unchanged. The Export tab also offers **Save SVG (line art)** (enabled while line art is on), which re-serialises the same geometry to a resolution-independent SVG document (`<path>` outlines and curves, `<circle>` image dots) for editing in vector tools or printing at any size. The **Background** toggle beside it (on by default) controls whether that document carries the opaque palette-colored backing rectangle; switching it off exports the vector structure on a transparent canvas, ready to drop onto a background of its own.

Only two source types produce clean lines and are drawn in this mode; Gaussian, exponential, and pasted-image sources have no hard edge and are ignored:

- **Point sources** are their solved image positions, drawn as dots.
- **Uniform-disc sources** have a hard edge, so their lensed image has a well-defined boundary: the zero level-set of

$$g(\boldsymbol{\theta}) = r_\text{ell}\!\left(\boldsymbol{\beta}(\boldsymbol{\theta})\right) - r,$$

where $r_\text{ell}$ is the disc's elliptical radius (Section 6) and $r$ its semi-major-axis radius. This is extracted by marching squares over the **same** $\boldsymbol{\beta}$ grid used for the critical curves (one ray trace feeds both when they are shown together), thresholding $g$ instead of the Jacobian determinant.

**Adaptive smoothing.** Near critical curves the magnification diverges, so $g$ is strongly nonlinear and a naive contour looks ragged or breaks up on thin, elongated arcs. Two mechanisms address this without a costly uniform grid:

1. **Per-vertex secant refinement.** Marching squares first places each crossing by linear interpolation of $g$ along a cell edge; a few bounded false-position steps then re-evaluate $g$ (by tracing that ray) and pull the vertex onto the true contour. The cost scales with contour *length* rather than grid area, and the iterations self-concentrate exactly where $g$ bends most, i.e. the high-magnification regions.
2. **Curvature-aware Chaikin smoothing.** The refined segments are chained into ordered polylines and corner-cut, but vertices whose turn is sharper than a threshold (a genuine cusp) are pinned, so sampling staircase is rounded off while real sharp features are preserved.

The base grid follows the **Critical curves** resolution setting (capped for live responsiveness); the secant refinement supplies the smoothness, so a moderate grid suffices.

### Annotation color

Directly below the Line art section, **Annotation color** sets the single ink used for the plot furniture that is not tied to a particular object: the scale bar, the legend text, the ruler lines and their measurement labels, the time-delay pills, and the Fermat stationary-point markers and their legend. Object-specific colors (lens / source markers, critical curves, caustics, point-source dots, and every line-art role) are unaffected.

With **Auto** on (the default) the ink snaps to white or black with the page's light / dark theme, giving the white-on-dark and black-on-light annotations the plot has always had. Choosing a color in the picker turns Auto off and pins that color, so annotations can be black on a dark page (or any other color) without switching the whole site theme. Re-checking **Auto** hands control back to the theme; unchecking it by hand pins whatever color was showing, so nothing jumps. Line art is the case this matters most for: a light palette (Ink inv., Mint, Espresso) on a dark page needs a black ink to keep the scale bar and legend readable, and pinning one is how you get it without flipping the whole site to light mode.

The picker takes any color, not just black or white. Halos, label-pill backgrounds and marker backings pick the contrasting member of their pair from the ink's brightness, so a light ink keeps its dark backing and vice versa. Both the Auto switch and the pinned color are saved in the config file (`annotAuto`, `annotColor`); the page theme itself is not, since it is a site-wide preference.

## 10. Recording, capture, and animation

The **Export tab** in the right rail turns the live view into a still image, a video, or a smooth animation. Every capture reflects exactly what is on screen: the active view (lensed image or any quantity map), the overlay (position markers, critical curves and caustics, ruler measurements), and the color bar. UI chrome (the rail, the quantity dropdown, the ruler and zoom buttons, the performance badge) is excluded, and in the lensed-image view the same light-mode inversion used on screen is baked into the output so the file matches what you see.

### Still image

**Save PNG** writes a single frame of the current view to `caustica.png`, at whatever resolution the canvas is currently drawn at, which the Render scale setting below controls.

### Render scale

The image panel has two independent sizes: how large it appears on screen, and the resolution the shader actually computes. **Render scale** (Settings tab) sets the ratio between them, and so fixes both how sharp the plot looks and how many pixels a PNG or video frame comes out with.

The factor applies to width and height separately, so the cost is quadratic: doubling the scale computes four times as many pixels. High-density screens (most phones, and Retina laptops) report a device pixel ratio of 2 or 3, meaning one layout pixel covers a 2×2 or 3×3 block of real display pixels.

| Mode | Scale used | Notes |
|---|---|---|
| Auto | the display's ratio, capped at 2 | Default. On a ratio-3 phone this is visually all but indistinguishable from Native while computing $2^2/3^2 \approx 44\%$ as many pixels. |
| 1× | always 1 | Fastest, and slightly soft on a high-density screen. Useful for keeping a heavy multiplane scene interactive. |
| Native | the display's full ratio | Sharpest and slowest; also the largest PNG, which is the reason to pick it for a figure destined for print. |

The setting changes only sharpness and speed. It never affects the lensing computation, so a scene renders the same physics at every scale, and it is stored in config files as `renderScale`.

### Video and GIF formats

Two output formats are offered, selected by the **Format** control:

| Format | Encoder | Notes |
|---|---|---|
| WebM | Browser-native `MediaRecorder` | Fast and lightweight. During a programmatic animation, critical curves are omitted so the real-time encoder keeps accurate frame timing. |
| GIF | Vendored `gif.js`, loaded on demand | Auto-looping and universally shareable, but slower to encode and limited to 256 colors. Programmatic animations include critical curves at full resolution. |

The **Frame rate** control offers 5, 10, 15, 24, or 30 fps.

### Free recording

Press **Record** (or the **R** key) to begin, then interact with the scene however you like: drag objects, adjust parameters, switch quantity maps, toggle overlays. Frames are grabbed at the chosen frame rate as you work. Press **Stop** (or **R** again) to finish and download the file (`caustica.webm` or `caustica.gif`). Recording stops automatically after 30 seconds as a safeguard.

### Programmatic animation

For smooth, reproducible motion without hand-dragging, use the **Programmatic** section:

1. Select an object, place it at its starting point, and click **Set** beside **Initial**; move it to its ending point and click **Set** beside **Final**.
2. Click **Add to program**. Repeat for as many objects as you like.
3. Set a **Duration** (0.5 to 60 s) and click **Record program**.

Every listed object is interpolated linearly and **simultaneously** from its initial to its final position over the duration, rendered frame by frame at the chosen frame rate (output `caustica-prog.webm` or `caustica-prog.gif`). Because the positions are computed rather than dragged, the animation is deterministic and free of the jitter of a hand-held drag.

<figure>
  <img class="img-light" src="/images/caustica-prog-2pointmass-light.gif" alt="Programmatic animation of two point-mass lenses moving apart, their critical curves and caustics evolving.">
  <img class="img-dark"  src="/images/caustica-prog-2pointmass.gif"  alt="Programmatic animation of two point-mass lenses moving apart, their critical curves and caustics evolving.">
  <figcaption>A programmatic GIF recording of two point-mass lenses, one moving left and one moving right, passing in front of a central background source. Each lens carries a circular critical curve (pink) and cuspy caustic (green).</figcaption>
</figure>

### Data export (CSV)

The **Data** section at the bottom of the Export tab writes the most recently computed overlays to CSV, with all positions in arcseconds. **Curves** exports the critical-curve and caustic segments (one row per segment, labelled `critical` or `caustic`, at the source redshift they were computed for); **Image positions** exports the numerically solved point-source image positions. Each button enables once the corresponding overlay has been computed at least once (show critical curves, or add a point source).

## 11. Preset Configurations

The *Presets…* dropdown in the top bar loads ready-made scenes; selecting the **Presets…** entry itself reloads the page's default scene:

- **Multiplane**: SIE lenses at $z = 0.4$ and $z = 0.8$ deflecting a Gaussian source at $z = 1.6$ in sequence.
- **Uniform Source**: two SIE lenses at $z = 0.5$, a main galaxy and an off-centre companion, lensing a uniform disc source at $z = 1.5$.
- **Point Source**: one SIE lens at $z = 0.5$ with a point source at $z = 1.5$. Critical curves, caustics, and the numerically solved image positions are shown.
- **Fermat surface demo**: an SIE and NIE lens pair at $z = 0.5$ with a uniform disc source at $z = 1.0$. Opens in the Fermat potential view with contours pinned to the source position.
- **ZigZag Lens**: a point source at $z = 2.38$ lensed twice, by a galaxy at $z = 1.89$ and again by one at $z = 0.18$, so the light path zigzags between planes.
- **Butterfly Caustic**: two flattened NIE lenses at $z = 0.5$ and with nearly perpendicular position angles. The caustic folds into butterfly metamorphoses at its cusps; [Orban de Xivry & Marshall (2009)](https://ui.adsabs.harvard.edu/abs/2009MNRAS.399....2O/abstract) give an atlas of such exotic lens configurations. Lenses split into two planes for ease of editing, but are effectively coplanar.
- **Galaxy group**: six SIE galaxies with external shear at $z = 0.5$ in a 40 arcsec field, with background sources at $z = 1.15$, $2.0$, and $3.0$.
- **Image recreation**: a quadruply imaged quasar, recreated by eye over the observation itself. The preset loads `quad_quasar_image.jpg` as its background image (§7), dimmed to $\beta_\text{bg} = 0.6$ so the solved image positions stay legible over it, and fits it with two SIE lenses at $z = 0.5$ and a point source at $z = 1.34$. It doubles as a template for the same exercise on any other system: upload your own observation as the background, then move the lenses and source until the computed images land on the real ones.
- **Line art**: a lensing scene shown in the vector Line art render mode (§9).

## 12. Code structure

Caustica is written in vanilla JavaScript with no framework. The source lives in `/assets/caustica/`.

### `lens.js`

Pure physics; no DOM access or rendering.

- **Cosmology**: `comovingDist`, `angDiamDist`, `angDiamDistBetween`: flat ΛCDM distance integrals via midpoint Riemann sum.
- **Deflection models**: `deflectPointMass`, `deflectSIE`, `deflectNIE`, `deflectEPL`: take a ray–lens separation in arcsec and return a deflection angle in arcsec.
- **`precomputeDistances(planes)`**: builds the $D_\text{obs}$ and $D_\text{btwn}$ arrays once per plane configuration.
- **`traceRay(θ, planes, dist, targetIdx)`**: evaluates the multiplane recursion in JavaScript; used for critical curve sampling.
- **`traceSourceGrid(planes, dist, sourceIdx, fov, gridN)`**: traces an $N \times N$ image-plane grid to the source plane and returns $\boldsymbol{\beta}$ at each node. Shared by the critical-curve and disc-outline extractors, both of which are marching squares over the same grid, so one trace can feed both.
- **`computeCriticalCurves(planes, dist, sourceIdx, fov, gridN, grid?)`**: computes the Jacobian determinant on the grid via finite differences, then runs marching squares to extract critical-curve and caustic segments. Accepts an optional precomputed `grid` from `traceSourceGrid`.
- **`computeDiscImageOutlines(planes, dist, sourceIdx, source, fov, gridN, grid?)`**: extracts the uniform-disc lensed-image boundary (the zero level-set of $r_\text{ell}(\boldsymbol{\beta}(\boldsymbol{\theta})) - r$) by marching squares over the same $\boldsymbol{\beta}$ grid, with per-vertex secant refinement so high-magnification arcs stay smooth (§9, Line art).
- **`chainSegments(segments, tol)`** and **`smoothPolylines(polys, opts)`**: link loose marching-squares segments into ordered polylines and apply curvature-aware (cusp-preserving) Chaikin smoothing; used for the line-art curves and disc outlines.

### `renderer.js`

WebGL2 GPU renderer.

- A single **GLSL 300 es fragment shader** runs the full multiplane lensing computation per pixel: it re-implements the multiplane recursion, all lens deflection models, all source brightness profiles, the colour-mapping warp, and the colour palettes entirely on the GPU.
- Scene data (plane redshifts and comoving distances, lens positions and parameters, source positions and parameters, pasted-image textures) are packed into uniform arrays and uploaded each frame. The background image (§7) occupies the texture slot after the pasted-image ones; `setBackdrop(canvas | null)` uploads or clears it and the `bgOpts` property carries the View-tab framing, so it is picked up by every existing `setScene()` call site without changing that signature. `_bgUniforms(fov)` turns the fit / zoom / pan / sky-lock controls into the shader's sample window, keeping that arithmetic in one place next to the texture whose aspect ratio it needs. Fermat mode additionally receives up to 8 saddle-image $\varphi$ values as a float array uniform so the shader can highlight those contour levels.
- The shader includes `lensPotential()` for analytic per-model potentials and `fermatPotential()`, which traces the ray and evaluates the comoving arrival-time surface (§4) for the Fermat map.
- `vizWarp()` applies the value→$[0,1]$ warp (linear/sqrt/log/power/asinh) and `applyColormap()` selects the palette; both are driven by the `u_vizScale`, `u_vizScaleParam`, `u_vizMin`, `u_vizMax`, and `u_colormap` uniforms.
- The `Renderer` class manages the WebGL context, shader compilation, geometry, and texture slots. `setScene(planes, dist, fov, viz, vizMode, vizSrcIdx, isDark, saddlePhis, fermatBeta)` triggers a redraw, where `viz = { scale, param, min, max, palette }`.
- `resize()` respects a `dprMode` property (`'auto'` caps the devicePixelRatio at 2, `'1x'` forces CSS-pixel resolution, `'native'` uses the full ratio), driven by the **Render scale** setting in the Settings tab.
- The detector model (§8) adds a post-process chain: `detectorOpts` carries the pixel scale and PSF, `_detectorPlan()` derives the pixel grid and the samples available per pixel (returning `applied: false` below `Renderer.MIN_SAMPLES`), `_ensureFbo()` manages the offscreen targets, `_blurInPlace()` runs the separable Gaussian, and `_runDetectorPasses()` bins to the canvas. `detectorInfo` reports back what was actually done so the UI can raise its warning.
- `MAX_PLANES` (8) and `MAX_OBJECTS` (32 per type) are exported so the UI can enforce the shader's caps: plane creation is blocked once 8 planes exist (with a toast), and the object count triggers a warning badge past 32 lenses or sources per type.
- `preserveDrawingBuffer: true` is set on the WebGL context to allow screenshot and recording capture.

### `main.js`

Application shell (~6400 lines).

- **`state`**: single object holding all mutable app state: planes and their objects, selected IDs, display flags, add mode, per-viz-mode colour-mapping settings (`vizScale`: scale, parameter, limits, and palette for each of surface brightness, $\kappa$, $\gamma$, $\lvert\mu\rvert$, $\lvert\hat{\boldsymbol{\alpha}}\rvert$), render scale, recording state.
- **`buildDOM()`**: constructs the entire UI tree in one pass: topbar (with the preset/YAML file cluster and ? shortcut button, plus a mobile-only **⋯** overflow menu whose items forward their clicks to the real controls, so phones keep the bar to one row), the stage holding the image panel and its chrome (view dropdown, overlay chips, z<sub>s</sub> chip, colorbar, ruler cluster, warning badges; the angular scale bar is drawn on the overlay canvas), the slim redshift timeline with its z<sub>max</sub> input, the right rail (tab bar, the four tab containers, and the persistent plane-card skeleton with its tool column — a direct child of the rail, not of any tab, so it stays pinned below the tab content on desktop), and the short-viewport rotate prompt.
- **Event wiring**: `attachHandlers()` for global keyboard/tab/toolbar/file-cluster events; `attachAxisHandlers()` for plane add/select/drag on the redshift axis; `attachPlaneCardHandlers(canvas)` once for the plane card (the plane is resolved at pointerdown); `attachImageHandlers(wrap)` for drag-to-move in the main image, which never creates objects (on narrow screens the wrap allows vertical page scrolling via touch-action: pan-y, and gestures the app owns opt out with a touchstart preventDefault; a horizontal touch swipe that starts on empty image space cycles the visualization mode through `cycleVizMode()`, deciding swipe-vs-scroll from the dominant axis of the first 10px of movement; `setCanvasTool()` picks the plane viewer's select / lens / source / hybrid tool); `attachZoomHandlers(wrap)` for wheel zoom and two-finger pinch (both funnel through `setFov()`, which clamps to [0.5, 300]″ and syncs the View-tab input).
- **`setRailTab(tab)`** switches the active rail tab (`scene` | `view` | `data` | `export`) for desktop and mobile alike, stamping `.sl-body[data-tab]` for the responsive CSS.
- **`renderSidebar()`**: renders the Scene panel (always) plus whichever other tab is active, via `renderScenePanel()` / `renderViewPanel()` / `renderExportPanel()` / `renderQualityPanel()`.
- **`renderPlaneCard()`**: refreshes the selected-plane viewer (the viewer canvas's plane-type border colour, z input, prev/next arrow states, canvas); `selectPlaneOffset()` implements the arrow buttons, the `[` / `]` shortcuts, and the mobile swipe. The viewer's skeleton is static DOM, so its listeners are wired once. On desktop the viewer is a permanent fixture pinned to the bottom of the rail, visible under every tab, with its top hairline running edge to edge; the object-parameter tab (labelled **Object**) scrolls above it. On phones the viewer lives in the **Scene** tab with the redshift timeline below it. There is no select tool: `setCanvasTool()` toggles the active L/S/H tool, and with none active (`state.addMode === 'select'`) a click on the canvas only selects and drags.
- **`computeThetaE(obj, plane, zs)`**: Einstein-radius helper behind the read-only θ<sub>E</sub> line at the bottom of the lens controls (point mass $b\sqrt{w}$, isothermal $b\,w$, EPL $b\,w^{1/(\gamma'-1)}$ with $w = D_{LS}/D_S$ to the reference source redshift). `updateThetaEReadout()` refreshes the line in place, without rebuilding the panel, from the parameter sliders, the plane-z input and timeline drag, the z<sub>s</sub>-ref controls, and the cosmology sliders.
- **`_doRedraw()`**: packs the scene into the renderer, redraws the axis canvas, and redraws the overlay (critical curves, position markers, legend, and ruler measurements) on a 2D canvas layered above the WebGL output. Ruler measurements live in `state.rulers` (arcsec endpoints) and are drawn by `drawOverlay()`; a ruler drag updates only the overlay, not the GPU scene. In Fermat mode, `findStationaryPoints()` locates images of the source at $\boldsymbol{\beta}_s$ via a grid search followed by Newton-Raphson refinement, classifies them by Jacobian type, and computes their $\varphi$ values using `_computeFullFermat()` (a CPU-side mirror of the shader's comoving arrival-time surface) before passing saddle $\varphi$ levels to the renderer.
- **`drawLineArtBase()`**: the line-art base layer (§9, Line art). When `state.lineArt` is set, `_doRedraw()` skips the GPU pass and `drawOverlay()` calls this first to fill the overlay with the palette background (covering the GL canvas) and draw the uniform-disc lensed-image outlines (`computeDiscImageOutlines` → `chainSegments` → `smoothPolylines`); the normal overlay sections then draw on top, recoloured to the palette, so markers/ruler/scale bar/legend stay visible. Palettes live in `LINE_ART_PALETTES` (fixed looks, independent of the site theme); selecting one seeds `state.lineArtColors` (via `paletteColors()`), which the per-role View-tab pickers then edit and `lineArtPalette()` resolves. The non-object annotations drawn on top take their color from `annotColors()` (see below), not from the palette. The image fill is drawn at `state.lineArtFillAlpha` (the **Fill alpha** box). `buildCompositeCanvas()` returns the overlay alone for PNG/recording capture in this mode.
- **`annotInk()` / `annotColors()`**: the single ink for the non-object annotations (§9, Annotation color). `annotAutoInk()` is the auto choice (white on a dark page, black on a light one); `annotInk()` returns it or the pinned `state.annotColor`, and `annotColors()` resolves one overlay pass into the ink plus its contrasting halo, pill and marker-backing colors (chosen by `hexLuma()`), which `drawOverlay()` and `_pillLabel()` read in place of the theme test they used before.
- **`buildLineArtSVGString()` / `exportLineArtSVG()`**: recompute the line-art geometry via the shared lens.js extractors and serialise it to an SVG document (`<path>` outlines and curves, `<circle>` image dots), wired to the Export tab's **Save SVG (line art)** button; the backing `<rect>` is emitted only when the adjacent **Background** toggle (`recState.svgBg`) is on, and the image fill's opacity is written as a `fill-opacity` attribute rather than 8-digit hex, which vector editors handle inconsistently.
- **Recording**: `captureSnapshot()` composites the WebGL canvas and overlay into a PNG, reflecting the current view (lensed image or quantity map); `startRecording()` / `stopRecording()` drive a `MediaRecorder` for WebM or a gif.js encoder for GIF. UI chrome (the viz-mode chip, colour bar, sidebar, ruler buttons, and the performance badge) lives in separate DOM elements and is intentionally excluded from both PNG and recordings. The light-mode colour inversion that matches the on-screen lensed image is applied only in surface-brightness mode, since the quantity maps carry their own theming; both capture paths share the `glCanvasInverted()` test with the CSS rule and with the background image's pre-inversion (§7).
- **Programmatic recording**: each selected object can have an initial and final position set; `startProgrammaticRecording()` interpolates all registered objects simultaneously.
- **Background image**: `pickBackgroundImage()` / `_applyBackgroundFile()` take an uploaded picture and `_loadBackgroundFromSite()` fetches one a config named, both funnelling into `_installBackground()`, which decodes it into a size-capped canvas and uploads the texture; `clearBackgroundImage()` drops it. A monotonic `_bgLoadSeq` token discards a load still in flight when the next config arrives. `isPresetBgName()` gates the `bgImage` key to a bare file name under one fixed directory: that stops a config file from making the browser fetch an arbitrary address, and keeps the texture same-origin, since a cross-origin image taints the canvas and WebGL then refuses to upload it. `state.bgSrc` records whether the current picture came from a config, which is what lets a load replace a preset image without touching a hand-uploaded one. `syncBackdrop()` — called at the top of `_doRedraw()` — pushes the framing controls into `renderer.bgOpts`, or `null` while the eye toggle hides it. `glCanvasInverted()` is the single source of truth for whether the GL canvas is CSS-inverted right now: it drives the light-mode inversion applied by PNG capture and recording, and the `invert` flag that makes the shader pre-invert the backdrop so it survives that inversion unchanged. `bgImageActive()` reports whether a backdrop is actually on screen (loaded, not hidden, lensed-image view, not line art) and only drives the section's explanatory note.
- **Instrument model**: the `INSTRUMENTS` table holds each detector's pixel scale and representative PSF width; `instrumentSpec()` resolves the selection (including Custom) and `detectorStats()` derives the field geometry — pixels across the field, samples per pixel, and the widest field the current grid can bin — which drives both the section's live readout (`instrReadoutHtml()`) and the warning pill (`reportDetector()`). `syncDetector()` pushes the result into `renderer.detectorOpts` from `_doRedraw()`, alongside `syncBackdrop()`.
- **Config save/load**: `configToYaml()` serialises all planes and objects, plus the view state needed to reproduce the rendered image (field of view, $z_\text{max}$, active viz mode, per-mode color mapping, contour spacing, critical-curve resolution, point-source grid density, render scale, the critical-curve redshift, the marker/legend/colorbar/critical-curve/caustic toggles, the line-art mode settings (palette, per-role colors, fill alpha, and the fill / smooth toggles), the annotation-ink mode and color, the background-image framing and hide toggle, and the instrument detector model), to a human-readable YAML string. `parseYamlConfig()` parses it back with strict type and range validation (allowlisted model names, hex-only color strings, bounded numeric coordinates), and the loader migrates the legacy point-mass `thetaE` key to its current name `b`. The scalar view settings are centralised in a `CONFIG_DEFAULTS` table that both seeds the initial state and supplies the fallback for any field missing from a loaded file, so older or partial configs load to a fully defined visual state rather than inheriting whatever was on screen. The page theme is not part of the config (it is a site-wide preference), nor are pasted-image textures or an uploaded background picture (binary data); a background image shipped with the site is carried by file name via the validated `bgImage` key instead (§7).
- **Data export**: `drawOverlay()` caches its last computed critical-curve/caustic segments (`state._lastCurves`) and point-source image positions (`state._lastPsImages`); the Export tab's Data section serialises these via `_downloadCSV()`.
- **Tour**: `startTour()` / `showTourStep()`: spotlight-and-tooltip tutorial whose step callbacks switch rail tabs (`setRailTab`) as needed, on desktop and mobile alike. A one-time nudge bubble on the Tour button invites first-time visitors.
- **Shortcut overlay**: `toggleKbdOverlay()` shows the in-app keyboard reference (the topbar **?** button, or the `?` key).

### `style.css`

Single stylesheet using CSS custom properties for theming (`--accent`, `--lens-color`, `--src-color`, `--hybrid-color`, and others) with `html[data-theme="dark"]` overrides.
The layout is a CSS grid: the stage (which letterboxes the square image using container-query units) and the slim timeline strip on the left, the tabbed rail on the right. On desktop the plane viewer is pinned to the bottom of the rail as a direct child (kept below whichever tab is open), and its top hairline runs edge to edge across the full rail width while its own horizontal padding insets the viewer content to match the tab panels. Narrow screens (≤ 640px) collapse to a single scrolling column — image, then the rail, with a mobile-only **Object** tab hosting the object controls and the plane viewer moving into the **Scene** tab above the redshift timeline. There the viewer's tools become a single column of larger tap targets (L / S / H at the top, a trash button floated to the bottom), the **‹ ›** arrows hug the canvas, and the tool column and the Redshift / Plane column stretch to the canvas height and sit an even gap from it, so the four control clusters frame the canvas at its corners. Short landscape viewports (height ≤ 480px, e.g. a phone held sideways) show a full-screen prompt asking for a taller window instead of the app.

### `gif.js` + `gif.worker.js`

A vendored local copy of the gif.js library.
Loaded lazily (only when GIF recording is requested) via a dynamic `<script>` tag, avoiding cross-origin Web Worker restrictions that would arise from a CDN-hosted copy.

## References

- Schneider, Ehlers & Falco (1992), *Gravitational Lenses*, Springer. *(Multiplane lensing formalism.)*
- Kormann, Schneider & Bartelmann (1994), Isothermal ellipsoidal mass distributions in gravitational lensing, A&A 284. *(SIE deflection angles.)*
- [Tessore & Metcalf (2015)](https://ui.adsabs.harvard.edu/abs/2015A%26A...580A..79T/abstract), The elliptical power law profile lens, A&A 580, A79. *(Exact closed-form EPL deflection and potential via the angular recurrence used here.)*
- Blandford & Narayan (1986), Fermat surface, caustics, and the time delay between images, ApJ 310. *(Fermat principle formulation of gravitational lensing; image types and time delays.)*
- [Orban de Xivry & Marshall (2009)](https://ui.adsabs.harvard.edu/abs/2009MNRAS.399....2O/abstract), An atlas of predicted exotic gravitational lenses, MNRAS 399. *(Swallowtail and butterfly caustic metamorphoses in compound lenses; basis for the Butterfly Caustic preset.)*
- Lupton, Blanton, Fekete et al. (2004), Preparing Red-Green-Blue Images from CCD Data, PASP 116. *(Asinh stretch for astronomical image display.)*
- Smith & van der Walt (2015), matplotlib viridis/inferno/plasma colormaps; Mikhailov (2019), Turbo colormap. *(Perceptually uniform palettes; implemented here via compact polynomial fits.)*
- [lenstronomy](https://github.com/lenstronomy/lenstronomy) (Birrer et al.), `LensModel/Profiles/epl_numba.py`. *(Reference implementation the EPL deflection and potential were ported from and validated against.)*
