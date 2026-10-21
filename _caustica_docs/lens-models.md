---
title: "5. Lens deflection models"
nav_title: "5. Lens deflection models"
order: 6
---

All models take the ray–lens separation $\mathbf{u} = \boldsymbol{\theta}_k - (c_x, c_y)$ (arcsec) and return a deflection angle $\hat{\boldsymbol{\alpha}}$ (arcsec).

Because the deflections are physical (the multiplane distance weights are applied separately), the strength parameters below are independent of any source. For the four mass models (point mass, SIE, NIE, EPL) a read-only **θ<sub>E</sub>** line at the bottom of the object controls reports the Einstein radius the selected lens alone would have for a source at the reference redshift $z_s$ (the same **z<sub>s</sub> ref** the critical curves and quantity maps use; View tab). With $w = D_{LS}/D_S$ it shows $b\sqrt{w}$ for the point mass, $b\,w$ for the isothermal models, and $b\,w^{1/(\gamma'-1)}$ for the EPL (circular-equivalent values; it reads — when the reference source is not behind the lens).

## Point mass

$$\hat{\boldsymbol{\alpha}}(\mathbf{u}) = \frac{b^2}{|\mathbf{u}|^2}\,\mathbf{u}$$

The deflection is radial with magnitude $b^2/\lvert\mathbf{u}\rvert$.
The parameter $b$ (labelled **Strength** in the controls, arcsec) equals $\sqrt{4GM/c^2 D_L}$, so $b \propto \sqrt{M}$ at fixed redshift.
The Einstein ring forms at $\lvert\boldsymbol{\theta}\rvert = b\sqrt{D_{LS}/D_S}$, not at $b$ itself, because the multiplane weight $D_{LS}/D_S$ is applied separately ($D_{LS}$: lens-to-source angular diameter distance; $D_S$: observer-to-source).

## SIE (Singular Isothermal Ellipsoid)

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

## NIE (Nonsingular Isothermal Ellipsoid)

The NIE is an SIE with a finite core radius $r_c > 0$, replacing the central density cusp with a finite core. The deflection formula is identical to the SIE with the softening radius $s$ set to the user-specified core radius instead of the numerical floor:

$$r_e = \sqrt{q^2(x_r^2 + r_c^2) + y_r^2}, \qquad s = r_c$$

All four SIE steps apply unchanged. The NIE has no critical curve at the origin and produces a finite central surface density $\Sigma_0 \propto b/r_c$, making it more physical for lenses with observed cores (e.g. galaxy clusters with brightest-cluster galaxies).

| Symbol | Meaning |
|---|---|
| $b$ | Deflection scale (arcsec), same role as in SIE |
| $q$ | Axis ratio $0 \lt q \leq 1$ |
| $\varphi$ | Position angle of major axis (radians) |
| $r_c$ | Core radius (arcsec); $r_c \to 0$ recovers the SIE |

## EPL (Elliptical Power Law)

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

## External shear

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
**Note.** The effective shear visible in the lensing-quantities map is $\gamma_\text{eff} = \gamma_\text{ext} \cdot D_{ls}/D_s$, not $\gamma_\text{ext}$ itself. See <a href="/caustica-documentation/lensing-quantities/">§4</a> for details.
</div>

## Constant deflection

Models the monopole contribution from a massive perturber far outside the field of view. All rays are deflected by the same constant angle regardless of their image-plane position:

$$\hat{\alpha}_x = \alpha\cos\varphi, \qquad \hat{\alpha}_y = \alpha\sin\varphi$$

This shifts caustics bodily without distorting them. It is the dominant effect of a distant perturber; at large separations shear (the quadrupole term) becomes the next-order correction.

| Symbol | Meaning |
|---|---|
| $\alpha$ | Deflection amplitude (arcsec). |
| $\varphi$ | Deflection direction (radians). |

The object's position has no effect on the lensing.

## External convergence

Models a uniform mass sheet along the line of sight (e.g. an overdense filament or underdense void). The deflection is purely radial, always evaluated relative to the coordinate origin:

$$\hat{\alpha}_x = \kappa\,\theta_x, \qquad \hat{\alpha}_y = \kappa\,\theta_y$$

This follows from the potential $\psi = \tfrac{\kappa}{2}\lvert\boldsymbol{\theta}\rvert^2$ and is isotropic, with no preferred direction.

| Symbol | Meaning |
|---|---|
| $\kappa$ | Convergence (dimensionless). Positive for overdense structures, negative for underdense voids. |

The object's position has no effect on the lensing. External convergence is related to the **mass sheet degeneracy**: a uniform sheet cannot be distinguished from a rescaling of all lens masses and source distances using image positions alone.
