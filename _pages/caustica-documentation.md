---
layout: doc
title: "How Caustica works"
permalink: /caustica-documentation/
---

[Caustica](/assets/caustica/) is a tool for easily visualizing strong gravitational lensing, named after the term used by 17th century mathematicians for the curves onto which refracted light rays converge, which were capable of burning objects.

<figure class="doc-fig-wide">
  <img class="img-light" src="/images/caustica-docs/ui-light.png" alt="The Caustica interface: lensed-image panel, redshift axis, plane panels, and controls.">
  <img class="img-dark"  src="/images/caustica-docs/ui-dark.png"  alt="The Caustica interface: lensed-image panel, redshift axis, plane panels, and controls.">
  <figcaption>The Caustica interface recreating a zigzag lens configuration. The image panel shows the lensed view; the redshift axis and plane panels hold the lens and source objects.</figcaption>
</figure>

## Quick start

1. **Click the redshift axis** (bottom left) to add an empty plane. Drag existing plane markers to reposition them along the axis.
2. **Pick a tool** using the L / S / H toolbar (or press 1 / 2 / 3): Lens (deflects light), Source (emits light), or Hybrid (both at once, shown as a purple dot).
3. **Click inside a plane panel** to place an object. Drag from an existing marker to move it. You can also drag objects directly in the main image panel.
4. **Adjust parameters** in the Object Controls panel on the right. For hybrid objects, separate collapsible sections appear for the lens and source halves, each with its own show/hide (eye) and delete buttons, so a single half can be toggled or removed while the other stays. The eye button excludes an object from the computation without deleting it. Copy the selected object with **Cmd/Ctrl+C** and paste a duplicate in the same place with **Cmd/Ctrl+V**.
5. **The image panel** updates in real time. Press C to overlay critical curves and caustics. Use the recording tab to save a PNG, WebM, or GIF.
6. **Measure angular distances** with the ruler. The ruler button sits at the bottom-left of the image panel (its visibility is controlled by **Show ruler** in the Settings tab, on by default). Click it or press **L** to arm it, then click-and-drag on the image between two points: a line appears with its separation in arcseconds and position angle (e.g. `1.42″ · 34°`). Each new measurement becomes the selected item, and measurements are editable: click one to select it, drag its line to move it, or drag an endpoint to reshape it. Delete the selected measurement with its **trash** button or **Backspace**; clear all of them with the **×** button. Measurements persist when you toggle the ruler off. The measurement lines are captured in saved PNGs and recordings; the ruler buttons themselves are not.
7. **Save and load configurations** using the Save YAML / Load YAML buttons at the bottom of the Settings tab. The file stores all planes, objects, and parameters along with the full view state, so a loaded config reproduces the same picture: field of view, active quantity, per-quantity color mapping, contour spacing, the critical-curve resolution and point-source grid density, and the overlay toggles. Any setting absent from a file (for instance one saved by an older version) loads at its default value.

## Keyboard shortcuts

| Key | Action |
|---|---|
| `1` / `2` / `3` | Select add mode: Lens / Source / Hybrid |
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
| `R` | Start / stop live recording |
| `L` | Toggle ruler mode (arm / disarm the ruler) |
| `D` | Toggle dark / light theme |
| `Cmd/Ctrl` + `C` / `V` | Copy the selected object / paste a duplicate in place |
| `↑ ↓ ← →` | Nudge selected object (hold for acceleration) |
| `Delete` / `Backspace` | Delete the selected object, or the selected ruler measurement |
| `Escape` | Deselect the selected ruler, else disarm the ruler tool, else deselect the object |

## 1. Coordinate system

All angular positions are measured in **arcseconds** (″): object coordinates $(c_x, c_y)$, deflection angles, and size parameters all use this unit.
The image panel shows a square patch of sky of side *field of view* `fov` (default 4″), centred on the optical axis.
Radians appear only in intermediate formulae and are converted back to arcseconds throughout.

### Measuring with the ruler

To read an angular separation directly off the image, click the ruler button in the bottom-left corner of the image panel, or press **L**, to arm it (the button's visibility is controlled by **Show ruler** in the Settings tab, on by default). With the tool armed, click and drag between any two points: the line's length is reported in arcseconds and its **position angle**, measured counter-clockwise from the positive $x$-axis (rightward) with $y$ increasing upward, as `distance″ · angle°`.

Endpoints are stored in sky coordinates, so a measurement stays anchored to the same points (and its readout stays constant) as you change the field of view. Measurements are additive: each drag adds another line, and the newest one becomes selected. A committed measurement is a first-class object: click it to select it, drag its line to move it, or drag either endpoint to reshape it. Only one thing (a measurement or an object) is selected at a time. Delete the selected measurement with the **trash** button next to the ruler or with **Backspace**; the **×** button clears all of them. Measurements persist when you toggle the ruler off (**Esc** first deselects the current measurement, then disarms the tool). The ruler lines are drawn on the same overlay as the markers and critical curves, so they appear in saved PNGs and recordings; the ruler buttons, being ordinary UI chrome, are excluded from both.

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
| Convergence $\kappa$ | $1 - \tfrac{1}{2}(A_{11}+A_{22})$ | Dimensionless projected mass density scaled by the critical surface density. $\kappa=0$ in empty space; $\kappa=1$ on the Einstein ring. |
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

The finite-difference Jacobian is accurate everywhere except very close to singular or steep profiles (point mass, EPL with large $\gamma$), where the deflection angle varies as $\sim 1/r$ or faster.
Near such singularities the truncation error of the central-difference scheme can produce small spurious structure in the $\kappa$ map; convergence is clamped to zero in the display to suppress the most prominent artefacts.
The shear and magnification maps are less affected.

### Colour scale, limits, and palette

The $\kappa$, $\gamma$, $\lvert\mu\rvert$, and $\lvert\hat{\boldsymbol{\alpha}}\rvert$ maps share a set of controls in the collapsible **Color Map** section of the Settings tab. Each map remembers its own settings.

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
- **Show colorbar** toggles the on-canvas colour bar, which is labelled with the current Min/Max (at most two decimal places).

A small ⓘ button in the section header summarises whichever controls are currently shown. The same Min/Max/Scale machinery also drives the brightness stretch of the lensed-image view (§6).

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
    <img class="img-light" src="/images/caustica-docs/fermat-images-light.png" alt="The same lens with a uniform circle source, showing the lensed images.">
    <img class="img-dark"  src="/images/caustica-docs/fermat-images-dark.png"  alt="The same lens with a uniform circle source, showing the lensed images.">
    <figcaption>The same lens with a uniform circle source: each lensed image lands exactly on a stationary point at left.</figcaption>
  </figure>
</div>
<figcaption style="text-align:center">Images form at stationary points of the arrival-time surface. Left: the surface and its markers. Right: the actual lensed light of a uniform circle source at the same positions.</figcaption>

#### Image type classification

The nature of each stationary point is determined by the Jacobian $A$ at that location:

| Type | Criterion | Character |
|---|---|---|
| I (minimum) | $\det A > 0$ and $\kappa < 1$ | The arrival time is a local minimum; the image has positive parity. |
| II (saddle) | $\det A < 0$ | The arrival time is a saddle point; the image has negative parity. |
| III (maximum) | $\det A > 0$ and $\kappa > 1$ | The arrival time is a local maximum; the image has positive parity. The central de-magnified image of an SIE belongs here. |

By Morse theory, for a source inside all caustics the image count follows the sequence I, II, I, II, III (for a standard galaxy lens), giving a total of an odd number. The difference (number of minima + maxima) minus (number of saddles) equals $+1$ for a simply connected lens.

#### Display

The map shows iso-$\varphi$ contour lines computed analytically per pixel in the fragment shader. The default contour spacing is $0.002\,\text{fov}^2$ arcsec², adjustable with the **Spacing** control in the Contours section of the Settings panel (a multiplier of this default, available whenever the Fermat map is shown). Because the spacing scales with the field of view, the contour density stays similar as you zoom. Contours fade toward the edge of the field. The contour passing through each Type II (saddle) image is drawn thicker and brighter because it separates distinct image regions on the arrival-time surface, and this highlight tracks the chosen spacing. Stationary point positions are overlaid as markers (circle for Type I, diamond for Type II, triangle for Type III) with a type legend in the lower right.

#### Lensing potentials by model

The potential $\psi_k$ is computed analytically where a closed form exists:

| Model | $\psi$ |
|---|---|
| Point mass | $b^2 \ln r$ |
| SIE / NIE | $\displaystyle\frac{bq}{\sqrt{1-q^2}}\left[x_r\arctan\frac{\sqrt{1-q^2}\,x_r}{r_e+s} + y_r\operatorname{arctanh}\frac{\sqrt{1-q^2}\,y_r}{r_e+q^2 s}\right]$ |
| External shear | $\tfrac{\gamma}{2}\left[(\theta_x^2-\theta_y^2)\cos 2\varphi + 2\theta_x\theta_y\sin 2\varphi\right]$ |
| External convergence | $\tfrac{\kappa}{2}\lvert\boldsymbol{\theta}\rvert^2$ |
| Constant deflection | $\alpha(\theta_x\cos\varphi + \theta_y\sin\varphi)$ |
| EPL | 0 (no closed form for the scaled-SIE approximation used here) |

For EPL lenses $\psi_k = 0$ (no closed form for the scaled-SIE approximation), so only the geometric term contributes and the Fermat potential reduces to a simple paraboloid for EPL-only configurations. This is noted in the EPL control panel.

#### Gauge note

The zero level of $\varphi$ has no absolute physical meaning; it depends on the normalisation convention. For a singular isothermal sphere with Einstein radius $b$ and source at the origin, $\varphi(\boldsymbol{\theta};0) = 0$ at $r = 0$ and $r = 2b$, not at the Einstein ring ($r = b$). What is physically meaningful is the **difference** in $\varphi$ between two images, which is proportional to the relative time delay between those images.

## 5. Lens deflection models

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

The shear object's position in the plane panel has no effect on the lensing computation; the deflection is always computed relative to the coordinate origin. The marker and direction arrow can be repositioned freely for visual organisation.

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

### Uniform circle

$$I = \begin{cases} A & r_\text{ell} \leq \sigma \\ 0 & \text{otherwise} \end{cases}$$

A filled disc of constant brightness with radius $\sigma$. The axis ratio $q$ is fixed at 1 (always circular), so $r_\text{ell}$ reduces to the ordinary Euclidean radius.

### Point source

A mathematically point-like source for simulating quasars or other compact objects. The source position $(c_x, c_y)$ is specified in the source plane; the simulator finds all image positions $\lbrace\theta_i\rbrace$ by solving the lens equation $\beta(\theta) = (c_x, c_y)$ numerically, then draws a circle of fixed angular radius $\sigma$ at each $\theta_i$ in the image plane.

Image positions are found via a two-stage algorithm: a coarse grid search using sign-change topology to locate starting guesses, followed by Newton–Raphson refinement with backtracking line search until $\lvert F(\theta)\rvert^2 \lt 10^{-14}$ arcsec². Each converged solution is deduplicated. Because the circles are drawn in the image plane with fixed size, they are not stretched or sheared by lensing; this is appropriate for modelling the PSF-limited appearance of a quasar image.

<div class="doc-warning" markdown="1">
**Heads up.** Einstein rings and arc-shaped images do not appear in this mode. Use a Gaussian or uniform circle source for extended-emission lensing. Highly demagnified images (such as the central odd image of an SIE lens) may be missed by the grid search.
</div>

The grid density used for image finding is set in the Settings tab under **Point Source**, as the number of sample points across the field of view (Coarse 150, Medium 300, Fine 600, or Very fine 1200). Denser grids find images more reliably near caustics but are slower; the default is Medium (300). Because the count is fixed rather than an absolute angular spacing, the cost stays bounded as the field of view grows to cluster scale.

### Pasted image

A user-pasted image is uploaded to the GPU as a WebGL texture.
At each pixel, $\boldsymbol{\beta}$ is converted to UV coordinates centred on $(c_x, c_y)$ spanning $\pm\tfrac{\text{fov}}{2}$ arcsec, and the texture is sampled with bilinear interpolation.

### Compositing and brightness stretch

Contributions from all source objects across all planes are summed per pixel to give a linear intensity $I \in [0,\infty)$.
Hidden objects contribute nothing to the sum, nor to deflection or critical curve computation.
The sum is clamped to $[0,1]$ and passed through a nonlinear stretch before display.

The dynamic range of astrophysical sources (bright ring core to faint extended arcs) far exceeds what a monitor can show linearly, so the stretch is essential. In surface-brightness mode the **Color Map** section of the Settings tab is titled **Brightness stretch** and exposes the same machinery used for the quantity maps (§4), applied independently to each RGB channel:

- **Black / White** points (the Min/Max limits, default $0$ and $1$): intensities at or below Black map to the background; at or above White they saturate.
- **Scale**: Linear, Square root (default, $\gamma=0.5$), Log, Power law ($\gamma \in [0.1, 2]$; lower $\gamma$ lifts faint emission more aggressively), or Asinh ($a \in [0.5, 20]$; near-linear at low intensity, logarithmic at high, the stretch used by SDSS, HST, and modern survey pipelines, Lupton et al. 2004).

With the default Black/White points of $0$ and $1$ the Square root, Power law, and Asinh curves all satisfy $f(0)=0$ and $f(1)=1$, reproducing the classic tone-mapping curves exactly. The colour-palette dropdown is hidden in this mode, since the lensed image carries its own colour.

## 7. Critical curves and caustics

**Critical curves** are contours in the image plane where $\det(\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}) = 0$.
Sources near a critical curve are highly magnified and stretched into arcs.
Their pre-images in the source plane are the **caustics**; crossing a caustic changes the image count by two.

The computation proceeds in four steps:

1. **Sample a ray grid.** Trace $N \times N$ rays (Resolution dropdown, default $N = 512$) to the chosen source plane using the multiplane recursion, recording $\boldsymbol{\beta}$ at each image-plane point.

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

## 8. Recording, capture, and animation

The **Recording tab** in the right sidebar turns the live view into a still image, a video, or a smooth animation. Every capture reflects exactly what is on screen: the active view (lensed image or any quantity map), the overlay (position markers, critical curves and caustics, ruler measurements), and the color bar. UI chrome (the sidebar, the quantity dropdown, the ruler buttons, the performance badge) is excluded, and in the lensed-image view the same light-mode inversion used on screen is baked into the output so the file matches what you see.

### Still image

**Save PNG** writes a single frame of the current view to `caustica.png`.

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
  <figcaption>A programmatic GIF recording of two point-mass lenses driven along set paths past a central source. Each lens carries a circular critical curve (pink) and cuspy caustic (green).</figcaption>
</figure>

## 9. Code structure

Caustica is written in vanilla JavaScript with no framework. The source lives in `/assets/caustica/`.

### `lens.js`

Pure physics; no DOM access or rendering.

- **Cosmology**: `comovingDist`, `angDiamDist`, `angDiamDistBetween`: flat ΛCDM distance integrals via midpoint Riemann sum.
- **Deflection models**: `deflectPointMass`, `deflectSIE`, `deflectNIE`, `deflectEPL`: take a ray–lens separation in arcsec and return a deflection angle in arcsec.
- **`precomputeDistances(planes)`**: builds the $D_\text{obs}$ and $D_\text{btwn}$ arrays once per plane configuration.
- **`traceRay(θ, planes, dist, targetIdx)`**: evaluates the multiplane recursion in JavaScript; used for critical curve sampling.
- **`computeCriticalCurves(planes, dist, sourceIdx, fov, gridN)`**: samples an $N \times N$ ray grid, computes the Jacobian determinant via finite differences, then runs marching squares to extract critical curve and caustic segments.

### `renderer.js`

WebGL2 GPU renderer.

- A single **GLSL 300 es fragment shader** runs the full multiplane lensing computation per pixel: it re-implements the multiplane recursion, all lens deflection models, all source brightness profiles, the colour-mapping warp, and the colour palettes entirely on the GPU.
- Scene data (plane redshifts and comoving distances, lens positions and parameters, source positions and parameters, pasted-image textures) are packed into uniform arrays and uploaded each frame. Fermat mode additionally receives up to 8 saddle-image $\varphi$ values as a float array uniform so the shader can highlight those contour levels.
- The shader includes `lensPotential()` for analytic per-model potentials and `fermatPotential()`, which traces the ray and evaluates the comoving arrival-time surface (§4) for the Fermat map.
- `vizWarp()` applies the value→$[0,1]$ warp (linear/sqrt/log/power/asinh) and `applyColormap()` selects the palette; both are driven by the `u_vizScale`, `u_vizScaleParam`, `u_vizMin`, `u_vizMax`, and `u_colormap` uniforms.
- The `Renderer` class manages the WebGL context, shader compilation, geometry, and texture slots. `setScene(planes, dist, fov, viz, vizMode, vizSrcIdx, isDark, saddlePhis, fermatBeta)` triggers a redraw, where `viz = { scale, param, min, max, palette }`.
- `preserveDrawingBuffer: true` is set on the WebGL context to allow screenshot and recording capture.

### `main.js`

Application shell (~4500 lines).

- **`state`**: single object holding all mutable app state: planes and their objects, selected IDs, display flags, add mode, per-viz-mode colour-mapping settings (`vizScale`: scale, parameter, limits, and palette for each of surface brightness, $\kappa$, $\gamma$, $\lvert\mu\rvert$, $\lvert\hat{\boldsymbol{\alpha}}\rvert$), recording state.
- **`buildDOM()`**: constructs the entire UI tree in one pass (image panel, sidebar tabs, redshift axis, plane boxes area, toolbar, plane setup bar).
- **Event wiring**: `attachHandlers()` for global keyboard/tab/toolbar events; `attachAxisHandlers()` for plane-dragging on the redshift axis; `attachPlaneCanvasHandlers(canvas, plane)` per plane panel; `attachImageHandlers(wrap)` for drag-to-move in the main image.
- **`renderSidebar()`**: rebuilds the Object Controls and settings/recording tab content. Called whenever selection or state changes.
- **`rebuildPlaneBoxes()`**: rebuilds the plane panel DOM from scratch, called when planes are added or removed.
- **`_doRedraw()`**: packs the scene into the renderer, redraws the axis canvas, and redraws the overlay (critical curves, position markers, legend, and ruler measurements) on a 2D canvas layered above the WebGL output. Ruler measurements live in `state.rulers` (arcsec endpoints) and are drawn by `drawOverlay()`; a ruler drag updates only the overlay, not the GPU scene. In Fermat mode, `findStationaryPoints()` locates images of the source at $\boldsymbol{\beta}_s$ via a grid search followed by Newton-Raphson refinement, classifies them by Jacobian type, and computes their $\varphi$ values using `_computeFullFermat()` (a CPU-side mirror of the shader's comoving arrival-time surface) before passing saddle $\varphi$ levels to the renderer.
- **Recording**: `captureSnapshot()` composites the WebGL canvas and overlay into a PNG, reflecting the current view (lensed image or quantity map); `startRecording()` / `stopRecording()` drive a `MediaRecorder` for WebM or a gif.js encoder for GIF. UI chrome (the viz-mode chip, colour bar, sidebar, ruler buttons, and the performance badge) lives in separate DOM elements and is intentionally excluded from both PNG and recordings. The light-mode colour inversion that matches the on-screen lensed image is applied only in surface-brightness mode, since the quantity maps carry their own theming.
- **Programmatic recording**: each selected object can have an initial and final position set; `startProgrammaticRecording()` interpolates all registered objects simultaneously.
- **Config save/load**: `configToYaml()` serialises all planes and objects, plus the view state needed to reproduce the rendered image (field of view, $z_\text{max}$, active viz mode, per-mode color mapping, contour spacing, critical-curve resolution and point-source grid density, the critical-curve redshift, and the marker/legend/colorbar/critical-curve/caustic toggles), to a human-readable YAML string. `parseYamlConfig()` parses it back with strict type and range validation (allowlisted model names, hex-only color strings, bounded numeric coordinates). The scalar view settings are centralised in a `CONFIG_DEFAULTS` table that both seeds the initial state and supplies the fallback for any field missing from a loaded file, so older or partial configs load to a fully defined visual state rather than inheriting whatever was on screen. The page theme and pasted-image textures are not part of the config (the former is a site-wide preference, the latter is binary data).
- **Tour**: `startTour()` / `showTourStep()`: spotlight-and-tooltip tutorial with mobile-aware step callbacks that open/close the plane setup drawer and switch mobile tabs as needed.

### `style.css`

Single stylesheet using CSS custom properties for theming (`--accent`, `--lens-color`, `--src-color`, `--hybrid-color`, and others) with `html[data-theme="dark"]` overrides.
The layout uses flexbox throughout: three-column on wide screens, collapsing to a single-column mobile layout with a fixed Plane Setup drawer at the bottom that slides up to reveal the redshift axis and plane panels.

### `gif.js` + `gif.worker.js`

A vendored local copy of the gif.js library.
Loaded lazily (only when GIF recording is requested) via a dynamic `<script>` tag, avoiding cross-origin Web Worker restrictions that would arise from a CDN-hosted copy.

## References

- Schneider, Ehlers & Falco (1992), *Gravitational Lenses*, Springer. *(Multiplane lensing formalism.)*
- Kormann, Schneider & Bartelmann (1994), Isothermal ellipsoidal mass distributions in gravitational lensing, A&A 284. *(SIE deflection angles.)*
- Blandford & Narayan (1986), Fermat surface, caustics, and the time delay between images, ApJ 310. *(Fermat principle formulation of gravitational lensing; image types and time delays.)*
- Lupton, Blanton, Fekete et al. (2004), Preparing Red-Green-Blue Images from CCD Data, PASP 116. *(Asinh stretch for astronomical image display.)*
- Smith & van der Walt (2015), matplotlib viridis/inferno/plasma colormaps; Mikhailov (2019), Turbo colormap. *(Perceptually uniform palettes; implemented here via compact polynomial fits.)*
