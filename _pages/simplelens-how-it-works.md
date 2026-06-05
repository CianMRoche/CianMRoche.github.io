---
layout: doc
title: "How simpleLens works"
permalink: /simplelens-how-it-works/
---

A description of the gravitational lensing computation behind [simpleLens](/assets/simple_lens/).

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

$$\chi(z) \;\approx\; D_H \cdot \Delta z \cdot \sum_{i=0}^{n-1} \frac{1}{E\!\left(\bigl(i+\tfrac{1}{2}\bigr)\Delta z\right)}, \qquad \Delta z = \frac{z}{n}$$

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

$$\boldsymbol{\theta}_j \;=\; \boldsymbol{\theta} \;-\; \sum_{k\,<\,j} \frac{D_{kj}}{D_j}\;\hat{\boldsymbol{\alpha}}_k\!\left(\boldsymbol{\theta}_k\right)$$

| Symbol | Meaning |
|---|---|
| $\boldsymbol{\theta}$ | Observed angle (image-plane position); fixed for each rendered pixel |
| $\boldsymbol{\theta}_j$ | Ray's angular position at plane $j$ (arcsec) |
| $D_{kj}$ | Angular diameter distance from plane $k$ to plane $j$ |
| $D_j$ | Angular diameter distance from observer to plane $j$ |
| $\hat{\boldsymbol{\alpha}}_k(\boldsymbol{\theta}_k)$ | Deflection angle from all lenses in plane $k$, evaluated at the ray's position $\boldsymbol{\theta}_k$ |

**Source planes** are passive: they receive the ray but contribute no deflection.
Only **lens planes** enter the sum.
The weight $D_{kj}/D_j$ converts the deflection at plane $k$ into its angular displacement at the later plane $j$.

The position at the final source plane is the **source-plane position** $\boldsymbol{\beta}$, where source brightness is sampled.

> Because each lens plane evaluates its deflection at the ray's *already-deflected* position $\boldsymbol{\theta}_k$, successive lens planes interact non-linearly — a key feature of multiplane lensing absent in single-plane calculations.

---

## 4. Lens deflection models

All models take the ray–lens separation $\mathbf{u} = \boldsymbol{\theta}_k - (c_x, c_y)$ (arcsec) and return a deflection angle $\hat{\boldsymbol{\alpha}}$ (arcsec).

### Point mass

$$\hat{\boldsymbol{\alpha}}(\mathbf{u}) = \frac{b^2}{|\mathbf{u}|^2}\,\mathbf{u}$$

The deflection is radial with magnitude $b^2/|\mathbf{u}|$.
The parameter $b$ (labelled **Strength** in the controls, arcsec) equals $\sqrt{4GM/c^2 D_L}$, so $b \propto \sqrt{M}$ at fixed redshift.
The Einstein ring forms at $|\boldsymbol{\theta}| = b\sqrt{D_{LS}/D_S}$, not at $b$ itself, because the multiplane weight $D_{LS}/D_S$ is applied separately.

### SIE (Singular Isothermal Ellipsoid)

A standard model for galaxy-scale lenses (Kormann et al. 1994).
The projected surface density falls as $1/r$.

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec) $= 4\pi\sigma_v^2/c^2$; independent of distances |
| $q$ | Axis ratio $0 \lt q \leq 1$ ($q=1$: circular) |
| $\varphi$ | Position angle of major axis (radians, from the $x$-axis) |

**Step 1:** rotate to principal axes using $\varphi$:

$$x_r = \cos\varphi\, u_x + \sin\varphi\, u_y, \qquad y_r = -\sin\varphi\, u_x + \cos\varphi\, u_y$$

**Step 2:** elliptical radius with softening $s = 0.001''$ to regularise the origin:

$$r = \sqrt{q^2(x_r^2 + s^2) + y_r^2}$$

**Step 3:** deflection in the principal frame, with $A = bq\,/\,\sqrt{1-q^2}$:

$$\alpha_{x_r} = A\arctan\!\left(\frac{\sqrt{1-q^2}\cdot x_r}{r + s}\right), \qquad \alpha_{y_r} = A\operatorname{arctanh}\!\left(\frac{\sqrt{1-q^2}\cdot y_r}{r + q^2 s}\right)$$

The arctanh function is absent in GLSL ES, so the shader uses $\operatorname{arctanh}(x) = \tfrac{1}{2}\ln\!\left(\dfrac{1+x}{1-x}\right)$.

**Step 4:** rotate back to the sky frame:

$$\alpha_x = \cos\varphi\,\alpha_{x_r} - \sin\varphi\,\alpha_{y_r}, \qquad \alpha_y = \sin\varphi\,\alpha_{x_r} + \cos\varphi\,\alpha_{y_r}$$

In the circular limit $q\to 1$, both arguments vanish and L'Hôpital's rule gives $|\hat{\boldsymbol{\alpha}}|\to b$: the constant-magnitude deflection of the singular isothermal sphere.

### EPL (Elliptical Power Law)

A generalisation of the SIE in which the density slope is a free parameter.
The projected surface density follows $\Sigma \propto m^{1-\gamma}$, where $m$ is the elliptical radius and $\gamma$ is the power-law slope; $\gamma = 2$ recovers the SIE exactly.

The deflection is the SIE result scaled by a radial factor:

$$\hat{\boldsymbol{\alpha}}_\text{EPL}(\mathbf{u}) = \left(\frac{m}{b}\right)^{2-\gamma} \hat{\boldsymbol{\alpha}}_\text{SIE}(\mathbf{u})$$

where $m$ is the elliptical radius from step 2 of the SIE and $\hat{\boldsymbol{\alpha}}_\text{SIE}$ is the SIE deflection at that position.

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), same role as in SIE |
| $q$ | Axis ratio $0 \lt q \leq 1$ |
| $\varphi$ | Position angle of the major axis (radians) |
| $\gamma$ | Power-law slope: $\gamma = 2$ isothermal, $\gamma \lt 2$ steeper central density, $\gamma \gt 2$ shallower. Observed galaxies typically have $\gamma \approx 1.9$–$2.1$. |

---

## 5. Source brightness models

Once a ray arrives at a source plane at position $\boldsymbol{\beta}$, the brightness of each source object is evaluated.
The elliptically-weighted separation from the source centre is:

$$\mathbf{d} = \boldsymbol{\beta} - (c_x, c_y), \qquad \begin{pmatrix}x_r \\ y_r\end{pmatrix} = R(-\varphi)\,\mathbf{d}, \qquad r_\text{ell}^2 = x_r^2 + (y_r/q)^2$$

where $R(-\varphi)$ rotates by $-\varphi$ to align with the source axes.

| Symbol | Meaning |
|---|---|
| $(c_x, c_y)$ | Source centre (arcsec) |
| $\varphi$ | Position angle of major axis (radians) |
| $q$ | Axis ratio minor/major, $0 \lt q \leq 1$ |
| $\sigma$ | Scale radius (arcsec) |
| $A$ | Amplitude (peak surface brightness) |

### Gaussian

$$I = A\exp\!\left(-\frac{r_\text{ell}^2}{2\sigma^2}\right)$$

The Show Shape ellipse is drawn at $r_\text{ell} = 2\sigma$.

### Exponential (Sérsic $n=1$)

$$I = A\exp\!\left(-\frac{r_\text{ell}}{\sigma}\right)$$

More extended than Gaussian; $\sigma$ is the exponential scale length.

### Uniform circle

$$I = A \cdot \mathbf{1}[r_\text{ell} \leq \sigma]$$

A filled disc of constant brightness; $\sigma$ is the radius.

### Pasted image

A user-pasted image is uploaded to the GPU as a WebGL texture.
At each pixel, $\boldsymbol{\beta}$ is converted to UV coordinates centred on $(c_x, c_y)$ spanning $\pm\tfrac{\text{fov}}{2}$ arcsec, and the texture is sampled with bilinear interpolation.

### Compositing and tone mapping

Contributions from all source objects across all source planes are summed per pixel to give a linear intensity $I \in [0,\infty)$.
The sum is clamped to $[0,1]$ and passed through a tone-mapping curve before display.

The dynamic range of astrophysical sources (bright ring core to faint extended arcs) far exceeds what a monitor can show linearly, so a nonlinear stretch is needed. Three standard options are available:

| Mode | Formula | Character |
|---|---|---|
| Linear | $\text{out} = I$ | No stretch. Faint arcs invisible; bright cores sharp. |
| Square root | $\text{out} = \sqrt{I}$ | Moderate stretch ($\gamma = 0.5$). Default. |
| Asinh | $\text{out} = \operatorname{asinh}(aI)\,/\,\operatorname{asinh}(a),\quad a=5$ | Aggressive stretch; used by SDSS, HST, and modern survey pipelines (Lupton et al. 2004). Near-linear at low $I$; logarithmic at high $I$. |

The normalisation $\operatorname{asinh}(a)$ ensures $f(1)=1$, so the output spans $[0,1]$ for all $a$.

---

## 6. Critical curves and caustics

**Critical curves** are contours in the image plane where $\det(\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}) = 0$.
Sources near a critical curve are highly magnified and stretched into arcs.
Their pre-images in the source plane are the **caustics**; crossing a caustic changes the image count by two.

The computation proceeds in four steps:

1. **Sample a ray grid.** Trace $N \times N$ rays (Resolution slider, default $N = 512$) to the chosen source plane using the multiplane recursion, recording $\boldsymbol{\beta}$ at each image-plane point.

2. **Compute the Jacobian.** At each interior grid point, approximate the $2\times2$ Jacobian $\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}$ via central finite differences and compute its determinant.

3. **Find zero-crossings.** Apply marching squares: for each $2\times2$ cell, linearly interpolate zero-crossings on edges where the determinant changes sign. Each cell contributes one short segment; adjacent cells chain into smooth curves.

4. **Map to caustics.** Each critical-curve point is traced to the source plane by interpolating from the already-computed $\boldsymbol{\beta}$ grid.

> Fine features such as cusps are only resolved at higher resolutions.

---

## References

- Schneider, Ehlers & Falco (1992), *Gravitational Lenses*, Springer. *(Multiplane lensing formalism.)*
- Kormann, Schneider & Bartelmann (1994), Isothermal ellipsoidal mass distributions in gravitational lensing, A&A 284. *(SIE deflection angles.)*
- Blandford & Narayan (1986), Fermat surface, caustics, and the time delay between images, ApJ 310. *(Early multiplane treatment.)*
- Lupton, Blanton, Fekete et al. (2004), Preparing Red-Green-Blue Images from CCD Data, PASP 116. *(Asinh stretch for astronomical image display.)*
