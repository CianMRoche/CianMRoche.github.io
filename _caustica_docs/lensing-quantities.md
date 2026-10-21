---
title: "4. Lensing quantities"
nav_title: "4. Lensing quantities"
order: 5
---

The **lensing-quantity views** (chosen from a view tab's menu above the image, or from the view menu on phones) visualise several quantities derived from the lens mapping at the chosen source redshift $z_s$.

## The lens mapping Jacobian

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

## Parity map

The **Parity** view (key `P`) colours each region by the type of image that would form there (see *Image type classification* below): Type I where $\det A > 0$ and $\kappa < 1$, Type II where $\det A < 0$, and Type III where $\det A > 0$ and $\kappa > 1$. The tangential critical curve is the boundary between I and II, and the radial curve the boundary between II and III. Point-source images are marked **+** or **−** for positive or negative parity. There is no colorbar.

## Stretch whiskers

The **Stretch** toggle (View tab, Display section) draws a grid of short lines over any view. Each line points the way a small round source at that spot would be stretched (the right singular vector of $A$ with the smaller singular value), with length proportional to $1 - \sigma_\text{min}/\sigma_\text{max}$. The lines vanish where there is no distortion, are longest at a critical curve, run along the tangential curve and cross the radial one. They stay visible under **Hide all overlays**.

## Image number

The **Image number** view (key `N`) maps the source plane at the reference $z_s$ as a grid of numbers. Each number is the count of images a point source at that position would have. One grid point is at the centre of the view, and the View tab's **Image Number** section sets the spacing and number size. A count of 1 is grey and each higher count has its own colour.

Crossing a caustic changes the count by two, so the count is $n_0 + 2k$, where $k$ is the number of caustic loops around the point (from winding numbers). $n_0$ is 1 for most lenses, but a point mass has a second image everywhere that comes from its singularity, not a caustic, so Caustica finds $n_0$ by running the point-source solver (<a href="/caustica-documentation/source-models/">§6</a>) at four points just outside all the caustics. Outside them the count is unambiguous; inside an SIE's radial caustic the faint central image from its numerical core is easy for the solver to miss. An NIE shows 1, 3, and 5. Caustica's SIE has a small numerical core with its own radial caustic, so it shows the same, and a point mass shows 2.

In this view sources are hidden and can't be dragged, but lenses can. Critical curves, image dots, time delays, and stretch whiskers are hidden too.

## Distance weighting and the effective shear

In the multiplane recursion, a lens at plane $k$ contributes to $A$ with weight $D_{kj}/D_j$, where $j$ indexes the source plane.
As a result, the **effective** shear and convergence seen in the map are attenuated relative to the model parameter:

$$\gamma_\text{eff} = \gamma_\text{input} \cdot \frac{D_{ls}}{D_s}, \qquad \kappa_\text{eff} = \kappa_\text{input} \cdot \frac{D_{ls}}{D_s}$$

For example, an external shear with $\gamma_\text{input} = 0.5$ placed at $z_l = 0.5$ with $z_s = 1.0$ will show $\gamma_\text{eff} \approx 0.21$ in the map, because $D_{ls}/D_s \approx 0.42$ for those redshifts.
The map value equals the input value only in the limiting case $z_l \to 0$, where $D_{ls}/D_s \to 1$.

This is the physically correct behaviour: the same lens produces weaker effective lensing when placed closer to the observer relative to the source.

## Numerical accuracy near singular profiles

The finite-difference Jacobian is accurate everywhere except very close to singular or steep profiles (point mass, EPL with large $\gamma'$), where the deflection angle varies as $\sim 1/r$ or faster.
Near such singularities the truncation error of the central-difference scheme can produce small spurious structure in the $\kappa$ map; convergence is clamped to zero in the display to suppress the most prominent artefacts.
The shear and magnification maps are less affected.

Rounding matters too, since the shader works in single precision. The isothermal deflections (SIE, NIE; <a href="/caustica-documentation/lens-models/">§5</a>) evaluate $\arctan$ and $\operatorname{arctanh}$ of an argument proportional to $\sqrt{1-q^2}$ and multiply the result by a prefactor proportional to $1/\sqrt{1-q^2}$, so as $q \to 1$ a tiny argument is multiplied back up by a factor of order $10^4$. The closed form $\tfrac12 \ln\frac{1+x}{1-x}$ loses about three digits to cancellation there, which once put roughly $10^{-3}$″ of noise on $\boldsymbol{\beta}$ for a round lens: invisible in the lensed image, but enough to swamp a finite-difference Jacobian. Both functions are therefore evaluated by their Taylor series for $\lvert x\rvert \lt 0.1$, which is exact to float precision there; above it, $\lvert x\rvert \le \sqrt{1-q^2}$ bounds the prefactor and the closed forms are accurate enough.

## Colour scale, limits, and palette

The $\kappa$, $\gamma$, $\lvert\mu\rvert$, and $\lvert\hat{\boldsymbol{\alpha}}\rvert$ maps share a set of controls in the **Color map** section (the **Colors** panel on a computer, the View tab on phones). Each map remembers its own settings. The reference source redshift these maps use is set by the **z<sub>s</sub> ref** control in the View tab's Field section (Auto tracks the highest source plane; a chip on the image shows the value in use). On a computer it is also a thin line across the scene drawer's redshift strip, labelled z<sub>s</sub>, dashed while Auto and solid once custom: dragging the line sets a custom value (switching the control to Custom), and double-clicking it returns to Auto, and quick toggles for critical curves, caustics, and markers sit beside the view dropdown on the image itself.

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

A small ⓘ button in the section header summarises whichever controls are currently shown; the header itself expands and collapses the section, as does the **Background** section (<a href="/caustica-documentation/background-image/">§7</a>). Both start collapsed. The same Min/Max/Scale machinery also drives the brightness stretch of the lensed-image view (<a href="/caustica-documentation/source-models/">§6</a>).

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

## Fermat potential

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

By default the position and source-plane redshift of the most recently selected source object are used for $\boldsymbol{\beta}_s$, so the arrival-time surface and image markers reflect the actual source being lensed. Unticking the **Use last selected source** checkbox in the Fermat Potential settings section (shown only in this mode) puts $\boldsymbol{\beta}_s = 0$ instead, the source at the coordinate origin; before any source has been selected, that is also what the surface uses.

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

### Image type classification

The nature of each stationary point is determined by the Jacobian $A$ at that location:

| Type | Criterion | Character |
|---|---|---|
| I (minimum) | $\det A > 0$ and $\kappa < 1$ | The arrival time is a local minimum; the image has positive parity. |
| II (saddle) | $\det A < 0$ | The arrival time is a saddle point; the image has negative parity. |
| III (maximum) | $\det A > 0$ and $\kappa > 1$ | The arrival time is a local maximum; the image has positive parity. The central de-magnified image of an SIE belongs here. |

By Morse theory, for a source inside all caustics the image count follows the sequence I, II, I, II, III (for a standard galaxy lens), giving a total of an odd number. The difference (number of minima + maxima) minus (number of saddles) equals $+1$ for a simply connected lens.

### Display

The map shows iso-$\varphi$ contour lines computed analytically per pixel in the fragment shader. The default contour spacing is $0.002\,\text{fov}^2$ arcsec², adjustable with the **Spacing** control in the Fermat Potential section of the View tab (a multiplier of this default, available whenever the Fermat map is shown). Because the spacing scales with the field of view, the contour density stays similar as you zoom. Contours fade toward the edge of the field. The contour passing through each Type II (saddle) image is drawn thicker and brighter because it separates distinct image regions on the arrival-time surface, and this highlight tracks the chosen spacing. Stationary point positions are overlaid as markers (circle for Type I, diamond for Type II, triangle for Type III) with a type legend in the lower right.

### Lensing potentials by model

The potential $\psi_k$ is computed analytically where a closed form exists:

| Model | $\psi$ |
|---|---|
| Point mass | $b^2 \ln r$ |
| SIE / NIE | $\displaystyle\frac{bq}{\sqrt{1-q^2}}\left[x_r\arctan\frac{\sqrt{1-q^2}\,x_r}{r_e+s} + y_r\operatorname{arctanh}\frac{\sqrt{1-q^2}\,y_r}{r_e+q^2 s}\right]$ |
| External shear | $\tfrac{\gamma}{2}\left[(\theta_x^2-\theta_y^2)\cos 2\varphi + 2\theta_x\theta_y\sin 2\varphi\right]$ |
| External convergence | $\tfrac{\kappa}{2}\lvert\boldsymbol{\theta}\rvert^2$ |
| Constant deflection | $\alpha(\theta_x\cos\varphi + \theta_y\sin\varphi)$ |
| EPL | $\tfrac{1}{2-t}\,(\mathbf{u}\cdot\hat{\boldsymbol{\alpha}}_\text{EPL})$, with $t=\gamma'-1$ (see <a href="/caustica-documentation/lens-models/">§5</a>, EPL) |

The EPL potential is the exact Tessore & Metcalf (2015) form $\psi = \tfrac{1}{2-t}(\mathbf{u}\cdot\hat{\boldsymbol{\alpha}})$, a true gradient field, so the Fermat surface and image classification derived from it are self-consistent. It is singular only at $\gamma'=3$ (where the profile's potential is logarithmic), which is guarded numerically.

### Gauge note

The zero level of $\varphi$ has no absolute physical meaning; it depends on the normalisation convention. For a singular isothermal sphere with deflection scale $b$ and source at the origin (taking $D_{LS}/D_S = 1$, so the Einstein ring sits at $r = b$), $\varphi(\boldsymbol{\theta};0) = 0$ at $r = 0$ and $r = 2b$, not at the Einstein ring ($r = b$). What is physically meaningful is the **difference** in $\varphi$ between two images, which is proportional to the relative time delay between those images.

### Time delays (days)

The **Time delays** toggle in the View tab labels each point-source image with its arrival time in days, relative to the first-arriving image (the global minimum of the arrival-time surface). It is greyed out until a point source sits behind a lens. The delay between two images is their difference in arrival time:

$$\Delta t_{ij} = \frac{K}{c}\,\big(\varphi_i - \varphi_j\big),\qquad K = \frac{\chi_L\,\chi_S}{\chi_S - \chi_L}$$

where $\varphi$ is the reduced Fermat potential from the box above (arcsec², converted to radians² in the code) and $K$ is its normalisation ($\chi_L$ is the first lens plane). For a single lens plane $K$ reduces to the **time-delay distance** $D_{\Delta t} = (1+z_L)\,D_L D_S / D_{LS}$, and the expression becomes the textbook single-plane result $\Delta t = (D_{\Delta t}/c)\,\Delta\varphi$.

The same formula holds for any number of lens planes, because the normalisation cancels: multiplying $\varphi$ back by $K$ recovers the raw comoving arrival time, so the delay depends only on the physical surface, not on the display scaling. Working in comoving coordinates is what keeps this simple, each $(1+z)$ factor is absorbed into the distances $\chi = (1+z)D$, since an excess comoving path length converts to observed time as length$/c$ (the proper-length contraction and cosmological dilation cancel).

Because $K \propto 1/H_0$, every delay scales inversely with the Hubble constant, while $\Omega_m$ shifts it through the distance ratios, and this sensitivity is exactly what time-delay cosmography exploits to measure $H_0$. The toggle needs at least one lens plane in front of the source and a point source with two or more images.
