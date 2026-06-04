---
layout: doc
title: "How simpleLens works"
permalink: /simplelens-how-it-works/
---

A description of the gravitational lensing computation behind [simpleLens](/assets/simple_lens/).

---

## 1. Coordinate system

All angular positions in the simulation are measured in **arcseconds** (arcsec, symbol ″).
The image panel represents a square patch of sky whose side length is the *field of view* `fov` (default 4 arcsec).
The centre of the patch lies on the optical axis.

Object positions $(c_x, c_y)$, deflection angles, and lens/source size parameters all use this unit.
Angles in radians appear only in intermediate physics formulae and are converted to arcseconds throughout.

---

## 2. Cosmological distances

The simulation uses a spatially flat ΛCDM cosmology with the following fixed parameters:

| Symbol | Value | Meaning |
|---|---|---|
| $H_0$ | 70 km s⁻¹ Mpc⁻¹ | Hubble constant (expansion rate today) |
| $\Omega_m$ | 0.3 | Matter density parameter |
| $\Omega_\Lambda$ | 0.7 | Dark-energy density parameter |
| $c$ | $2.998\times10^5$ km s⁻¹ | Speed of light |

### Dimensionless Hubble parameter

$$E(z) = \sqrt{\Omega_m(1+z)^3 + \Omega_\Lambda}$$

$E(z)$ encodes how the expansion rate changes with redshift.
At $z=0$, $E(0) = \sqrt{0.3+0.7} = 1$ by construction (flat universe).
At high $z$ the matter term $\Omega_m(1+z)^3$ dominates.

### Comoving and angular diameter distances

The **comoving distance** to redshift $z$ is obtained by integrating along the path of a light ray:

$$\chi(z) = D_H \int_0^z \frac{dz'}{E(z')}, \qquad D_H = \frac{c}{H_0} \approx 4283\;\text{Mpc}$$

where $D_H$ is the Hubble distance, the natural length scale of the universe today.

The **angular diameter distances** used in the lensing formula are then:

$$D(0,z) = \frac{\chi(z)}{1+z} \qquad \text{(observer to redshift } z\text{)}$$

$$D(z_1, z_2) = \frac{\chi(z_2) - \chi(z_1)}{1+z_2} \qquad \text{(between two redshifts, flat universe)}$$

The $(1+z)$ factors convert comoving to physical distances as seen by an observer.

### Numerical integration

The integral for $\chi(z)$ has no closed form in general and is evaluated numerically using the **midpoint Riemann rule** with $n = 200$ equal-width steps.
The interval $[0, z]$ is divided into $n$ sub-intervals of width $\Delta z = z/n$, and the integrand is evaluated at the midpoint of each:

$$\chi(z) \;\approx\; D_H \cdot \Delta z \cdot \sum_{i=0}^{n-1} \frac{1}{E\!\left(\bigl(i+\tfrac{1}{2}\bigr)\Delta z\right)}, \qquad \Delta z = \frac{z}{n},\quad n=200$$

The midpoint rule achieves second-order accuracy (error $\propto \Delta z^2$).
For $n = 200$ and cosmological redshifts $z \leq 5$, the relative error in $\chi$ is well below $0.01\%$, negligible for lensing purposes.

Distances are precomputed once whenever the plane configuration changes and packed into two arrays passed to the GPU:

| Array | Entry | Meaning |
|---|---|---|
| `D_obs[i]` | $D(0, z_i)$ | Angular diameter distance from observer to plane $i$ |
| `D_btwn[i,j]` | $D(z_i, z_j)$ | Angular diameter distance between planes $i$ and $j$ |

---

## 3. Multiplane lensing recursion

Planes are sorted by increasing redshift.
A ray **observed** at image-plane angle $\boldsymbol{\theta}$ (a 2-D vector in arcsec) is traced forward through each plane in order.
Its angular position at plane $j$ is given by the *multiplane recursion* (Schneider, Ehlers & Falco 1992; Eq. 9.3):

$$\boldsymbol{\theta}_j \;=\; \boldsymbol{\theta} \;-\; \sum_{k\,<\,j} \frac{D_{kj}}{D_j}\;\hat{\boldsymbol{\alpha}}_k\!\left(\boldsymbol{\theta}_k\right)$$

| Symbol | Meaning |
|---|---|
| $\boldsymbol{\theta}$ | Observed angle (image-plane position); fixed for each rendered pixel |
| $\boldsymbol{\theta}_j$ | Ray's angular position at plane $j$ (2-D, arcsec) |
| $D_{kj}$ | Angular diameter distance from plane $k$ to plane $j$ |
| $D_j$ | Angular diameter distance from observer to plane $j$ |
| $\hat{\boldsymbol{\alpha}}_k(\boldsymbol{\theta}_k)$ | Physical deflection angle (2-D, arcsec) from all lenses in plane $k$, evaluated at the ray's arrival position $\boldsymbol{\theta}_k$ at that plane |

**Source planes** are passive: they receive the ray but contribute no deflection.
Only **lens planes** enter the sum.
The dimensionless weight $D_{kj}/D_j$ converts the physical deflection at plane $k$ into its angular displacement at the later plane $j$.

The computation initialises $\boldsymbol{\theta}_i = \boldsymbol{\theta}$ for all $i$, then iterates $j$ from 0 to the target source-plane index:
1. For each prior lens plane $k \lt j$, compute the physical deflection from all lenses in that plane and accumulate it weighted by $D_{kj}/D_j$.
2. Subtract the accumulated sum from $\boldsymbol{\theta}$ to obtain $\boldsymbol{\theta}_j$, exactly as in the recursion equation above.

The final value $\boldsymbol{\theta}_\text{target}$ is the **source-plane position** $\boldsymbol{\beta}$, the unlensed position where the ray lands.
Source brightness is sampled at $\boldsymbol{\beta}$.

> Because each lens plane evaluates its deflection at the ray's *already-deflected* position $\boldsymbol{\theta}_k$, successive lens planes interact non-linearly, a key feature of multiplane lensing absent in single-plane calculations.

---

## 4. Lens deflection models

All models take the ray–lens separation $\mathbf{u} = \boldsymbol{\theta}_k - (c_x, c_y)$ (in arcsec) and return a deflection angle $\hat{\boldsymbol{\alpha}}$ (also in arcsec).

### Point mass

$$\hat{\boldsymbol{\alpha}}(\mathbf{u}) = \frac{b^2}{|\mathbf{u}|^2}\,\mathbf{u}$$

The deflection is radial with magnitude $b^2/|\mathbf{u}|$.
The parameter $b$ (labelled **Strength** in the controls, in arcsec) equals $\sqrt{4GM/c^2 D_L}$.
For a fixed lens redshift $D_L$ is constant, so $b \propto \sqrt{M}$: it acts as a mass scale.
The Einstein ring forms at $|\boldsymbol{\theta}| = b\sqrt{D_{LS}/D_S}$, not at $b$ itself, because the multiplane weight $D_{LS}/D_S$ is applied separately.

### SIE: Singular Isothermal Ellipsoid (Kormann et al. 1994)

A standard model for galaxy-scale lenses.
The projected surface density falls as $1/r$.
Parameters:

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), $= 4\pi\sigma_v^2/c^2$. Proportional to velocity-dispersion squared; independent of distances. |
| $q$ | Axis ratio $0 \lt q \leq 1$ ($q=1$: circular SIS) |
| $\varphi$ | Position angle of major axis (radians, from the $x$-axis) |

The deflection is computed in four steps.

**Step 1:** rotate to principal axes** using $\varphi$:

$$x_r = \cos\varphi\, u_x + \sin\varphi\, u_y, \qquad y_r = -\sin\varphi\, u_x + \cos\varphi\, u_y$$

**Step 2:** elliptical radius with softening $s = 0.001''$ to regularise the origin:

$$r = \sqrt{q^2(x_r^2 + s^2) + y_r^2}$$

**Step 3:** deflection in principal frame, with $A = bq\,/\,\sqrt{1-q^2}$:

$$\alpha_{x_r} = A\arctan\!\left(\frac{\sqrt{1-q^2}\cdot x_r}{r + s}\right), \qquad \alpha_{y_r} = A\operatorname{arctanh}\!\left(\frac{\sqrt{1-q^2}\cdot y_r}{r + q^2 s}\right)$$

The arctanh function is absent in GLSL ES, so the shader uses the identity $\operatorname{arctanh}(x) = \tfrac{1}{2}\ln\left(\dfrac{1+x}{1-x}\right)$.

**Step 4:** rotate back to the sky frame:

$$\alpha_x = \cos\varphi\,\alpha_{x_r} - \sin\varphi\,\alpha_{y_r}, \qquad \alpha_y = \sin\varphi\,\alpha_{x_r} + \cos\varphi\,\alpha_{y_r}$$

In the circular limit $q\to 1$, $\sqrt{1-q^2}\to 0$ and both arguments vanish.
L'Hôpital's rule gives $|\hat{\boldsymbol{\alpha}}|\to b$: the constant-magnitude deflection of the SIS.

### EPL — Elliptical Power Law

A generalisation of the SIE in which the density slope is a free parameter.
The projected surface density follows $\Sigma \propto m^{1-\gamma}$, where $m$ is the elliptical radius and $\gamma$ is the power-law slope.
For $\gamma = 2$ this reduces exactly to the SIE.

The deflection is computed by scaling the SIE deflection angles by the radial factor $(m/b)^{2-\gamma}$:

$$\hat{\boldsymbol{\alpha}}_\text{EPL}(\mathbf{u}) = \left(\frac{m}{b}\right)^{2-\gamma} \hat{\boldsymbol{\alpha}}_\text{SIE}(\mathbf{u})$$

where $m = \sqrt{q^2(x_r^2 + s^2) + y_r^2}$ is the softened elliptical radius in the principal frame (same as for the SIE), and $\hat{\boldsymbol{\alpha}}_\text{SIE}$ is the SIE deflection at that position.
For $\gamma = 2$ the scale factor is $(m/b)^0 = 1$ and the SIE result is recovered exactly.

The four parameters are:

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), same role as the SIE parameter |
| $q$ | Axis ratio $0 \lt q \leq 1$ |
| $\varphi$ | Position angle of the major axis (radians) |
| $\gamma$ | Power-law slope: 2 = isothermal, $\gamma \lt 2$ steeper central density, $\gamma \gt 2$ shallower. Observed galaxies typically have $\gamma \approx 1.9$–$2.1$. |

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
| $\sigma$ | Scale radius (arcsec), angular size of the source |
| $A$ | Amplitude, peak surface brightness |

### Gaussian

$$I = A\exp\!\left(-\frac{r_\text{ell}^2}{2\sigma^2}\right)$$

The Show Shape ellipse in the controls is drawn at $r_\text{ell} = 2\sigma$.

### Exponential (Sérsic $n=1$)

$$I = A\exp\!\left(-\frac{r_\text{ell}}{\sigma}\right)$$

A more extended profile than Gaussian; $\sigma$ is the exponential scale length.

### Pasted image

A user-pasted image is uploaded to the GPU as a WebGL texture.
At each pixel, $\boldsymbol{\beta}$ is converted to UV coordinates centred on $(c_x, c_y)$ spanning $\pm\tfrac{\text{fov}}{2}$ arcsec, and the texture is sampled with bilinear interpolation.

Contributions from all source objects across all source planes are summed per pixel and tone-mapped with a square-root curve, $\text{out} = \sqrt{\text{clamp}(\text{sum},0,1)}$, before display.

---

## 6. Critical curves and caustics

**Critical curves** are contours in the image plane where $\det(\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}) = 0$.
Near a critical curve a source produces highly magnified, stretched arcs.
Their pre-images in the source plane are the **caustics**.
Crossing a caustic changes the image count by two.

The computation proceeds in four steps:

1. **Sample a ray grid.** Trace $N \times N$ rays (Resolution slider, default $N = 512$) to the chosen source plane using the same multiplane recursion as the renderer, recording $\boldsymbol{\beta}$ at each image-plane sample point.

2. **Compute the Jacobian.** At each interior grid point, approximate the $2\times2$ Jacobian $\partial\boldsymbol{\beta}/\partial\boldsymbol{\theta}$ via 4-point central finite differences and compute its determinant.

3. **Find zero-crossings (the critical curves).** Apply marching squares: for each $2\times2$ cell of the determinant grid, check whether adjacent corners have opposite signs. If so, linearly interpolate to find the crossing point on that edge. Each cell with two crossings produces one short line segment; adjacent cells share endpoints, chaining segments into smooth curves.

4. **Map to caustics.** Each critical-curve point is mapped to the source plane via $\boldsymbol{\beta} = \text{traceRay}(\boldsymbol{\theta}_\text{crit})$, using interpolation from the already-computed $\boldsymbol{\beta}$ grid.

> Fine features such as cusps are only resolved at higher resolutions. The Resolution slider controls $N$; higher values capture more detail but are slower.

---

## References

- Schneider, Ehlers & Falco (1992), *Gravitational Lenses*, Springer. *(Multiplane lensing formalism.)*
- Kormann, Schneider & Bartelmann (1994), Isothermal ellipsoidal mass distributions in gravitational lensing, A&A 284. *(SIE deflection angles.)*
- Blandford & Narayan (1986), Fermat surface, caustics, and the time delay between images, ApJ 310. (Early multiplane treatment.)*
