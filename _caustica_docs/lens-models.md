---
title: "5. Lens deflection models"
nav_title: "5. Lens deflection models"
order: 6
---

Each lens model gives the bending angle $\hat{\boldsymbol{\alpha}}$ (arcsec) of a ray passing at $\mathbf{u} = \boldsymbol{\theta}_k - (c_x, c_y)$ from the lens centre $(c_x, c_y)$, where $\boldsymbol{\theta}_k$ is the ray's position on the lens plane (<a href="/caustica-documentation/multiplane/">§3</a>). This is the physical bending, which does not depend on any source; the distance weight $D_{kj}/D_j$ is applied separately (<a href="/caustica-documentation/multiplane/">§3</a>).

For the point mass, SIE, NIE and EPL, a line under the object's controls shows its Einstein radius $\theta_E$, the radius of the ring this lens alone would form for a source at z<sub>s</sub> ref (<a href="/caustica-documentation/lensing-quantities/">§4</a>). With $w = D_{ls}/D_s$ (lens-to-source over observer-to-source distance), it is $b\sqrt{w}$ for the point mass, $b\,w$ for the SIE and NIE (ignoring the NIE's core), and $b\,w^{1/(\gamma'-1)}$ for the EPL. It shows a dash when z<sub>s</sub> ref is not behind the lens.

## Point mass

$$\hat{\boldsymbol{\alpha}}(\mathbf{u}) = \frac{b^2}{\lvert\mathbf{u}\rvert^2}\,\mathbf{u}$$

| Symbol | Control | Meaning |
|---|---|---|
| $b$ | Strength (″) | Deflection scale (0.01″ to 100″), $b^2 = 4GM/(c^2 D_l)$, with $M$ the mass, $G$ the gravitational constant and $D_l$ the distance to the lens |

The bending points toward the lens with size $b^2/\lvert\mathbf{u}\rvert$. $\lvert\mathbf{u}\rvert$ is not allowed below 0.001″, to avoid dividing by zero. The Einstein ring is at $b\sqrt{D_{ls}/D_s}$, not at $b$.

## SIE (Singular Isothermal Ellipsoid)

The standard model for a galaxy (Kormann et al. 1994). Its projected density falls as $1/r_e$, with $r_e$ the elliptical radius below.

| Symbol | Control | Meaning |
|---|---|---|
| $b$ | b (″) | Deflection scale (0.01″ to 100″), $b = 4\pi\sigma_v^2/c^2$ with $\sigma_v$ the galaxy's velocity dispersion |
| $q$ | q | Axis ratio minor/major, $0.05 \leq q \leq 1$ ($q = 1$ is round) |
| $\varphi$ | φ (rad) | Position angle of the major axis, counter-clockwise from $+x$ |
| $s$ | | Core radius, fixed at 0.001″ to avoid dividing by zero at the centre |

The deflection is computed in four steps.

1. Rotate into the frame of the lens axes:

   $$x_r = \cos\varphi\, u_x + \sin\varphi\, u_y, \qquad y_r = -\sin\varphi\, u_x + \cos\varphi\, u_y.$$

2. Elliptical radius:

   $$r_e = \sqrt{q^2(x_r^2 + s^2) + y_r^2}.$$

3. Deflection along the lens axes, with $A = bq/\sqrt{1-q^2}$:

   $$\alpha_{x_r} = A\arctan\left(\frac{\sqrt{1-q^2}\, x_r}{r_e + s}\right), \qquad \alpha_{y_r} = A\operatorname{arctanh}\left(\frac{\sqrt{1-q^2}\, y_r}{r_e + q^2 s}\right).$$

4. Rotate back:

   $$\hat\alpha_x = \cos\varphi\,\alpha_{x_r} - \sin\varphi\,\alpha_{y_r}, \qquad \hat\alpha_y = \sin\varphi\,\alpha_{x_r} + \cos\varphi\,\alpha_{y_r}.$$

As $q \to 1$ the bending tends to size $b$ everywhere, the round (singular isothermal sphere) case.

## NIE (Nonsingular Isothermal Ellipsoid)

An SIE with a finite core: the density levels off inside the core radius instead of rising without limit, so the central density is finite ($\propto b/r_c$) and there is no critical curve at the centre. The formulas are the SIE's with $s = r_c$.

| Symbol | Control | Meaning |
|---|---|---|
| $b$, $q$, $\varphi$ | b, q, φ | As for the SIE |
| $r_c$ | r<sub>c</sub> (″) | Core radius, 0.005″ to 20″; $r_c \to 0$ gives the SIE |

## EPL (Elliptical Power Law)

An SIE whose density slope is free, using the exact deflection of Tessore & Metcalf (2015), ported from [lenstronomy](https://github.com/lenstronomy/lenstronomy). The projected density goes as $r_e^{1-\gamma'}$.

| Symbol | Control | Meaning |
|---|---|---|
| $b$, $q$, $\varphi$ | b, q, φ | As for the SIE |
| $\gamma'$ | γ′ | Slope of the 3D density, $\rho \propto r^{-\gamma'}$, from 0.5 to 3. $\gamma' = 2$ is the SIE; observed galaxies have about 1.9 to 2.1 |

With $t = \gamma' - 1$ and $b' = bq$ (which makes $b$ mean the same as in the SIE), the deflection along the lens axes, written as a complex number $\alpha_{x_r} + i\,\alpha_{y_r}$, is

$$\alpha_{x_r} + i\,\alpha_{y_r} = \frac{2b'}{1+q}\left(\frac{b'}{R}\right)^{t-1}\Omega(\omega), \qquad R = \sqrt{q^2 x_r^2 + y_r^2},$$

where $\omega$ is the angle of the point $(q\,x_r,\ y_r)$ from the $x_r$ axis and $R$ is no smaller than 0.001″. The angular factor is the sum $\Omega = \sum_{n \geq 0} \Omega_n$ of

$$\Omega_0 = e^{i\omega},\qquad \Omega_n = \Omega_{n-1}\,\frac{2n-(2-t)}{2n+(2-t)}\left(-\frac{1-q}{1+q}\,e^{2i\omega}\right),$$

stopped once $\lvert\Omega_n\rvert^2 < 10^{-14}$ or after 200 terms. The result is rotated back as in step 4 of the SIE. Its potential (<a href="/caustica-documentation/lensing-quantities/#lensing-potentials-by-model">§4</a>) is $\psi = \mathbf{u}\cdot\hat{\boldsymbol{\alpha}}/(2-t)$, because $\psi$ grows as $\lvert\mathbf{u}\rvert^{2-t}$ along any line from the centre.

The code was checked against the SIE at $\gamma' = 2$ (agreement to about $10^{-3}$″, the size of the SIE's core), and to confirm that the deflection is the slope of $\psi$.

## External shear

The stretching from mass that is not modelled directly, such as a nearby group or cluster. It acts relative to $(0, 0)$, wherever the object is placed; its position only sets where the direction arrow is drawn. With $\boldsymbol{\theta} = (\theta_x, \theta_y)$ the ray's position on the plane,

$$\hat{\alpha}_x = \gamma(\theta_x \cos 2\varphi + \theta_y \sin 2\varphi), \qquad \hat{\alpha}_y = \gamma(\theta_x \sin 2\varphi - \theta_y \cos 2\varphi).$$

| Symbol | Control | Meaning |
|---|---|---|
| $\gamma$ | γ | Shear strength, 0.001 to 0.5 (typically 0.01 to 0.2 for a galaxy lens) |
| $\varphi$ | φ (rad) | Direction of the stretching, 0 to π |

The shear shown in the maps is $\gamma\,D_{ls}/D_s$, not $\gamma$ (<a href="/caustica-documentation/lensing-quantities/#distance-weighting-and-the-effective-shear">§4</a>).

## Constant deflection

Every ray is bent by the same angle, the main effect of a massive object far outside the view. It moves the caustics without changing their shape. The object's position has no effect.

$$\hat{\alpha}_x = \alpha\cos\varphi, \qquad \hat{\alpha}_y = \alpha\sin\varphi$$

| Symbol | Control | Meaning |
|---|---|---|
| $\alpha$ | α (″) | Size of the bending, 0.005″ to 5″ |
| $\varphi$ | φ (rad) | Direction of the bending, 0 to 2π |

## External convergence

A uniform sheet of mass across the field (positive), or a uniform deficit such as a void (negative). It acts relative to $(0, 0)$; the object's position has no effect.

$$\hat{\alpha}_x = \kappa\,\theta_x, \qquad \hat{\alpha}_y = \kappa\,\theta_y$$

| Symbol | Control | Meaning |
|---|---|---|
| $\kappa$ | κ | Density of the sheet in units of the critical density (<a href="/caustica-documentation/lensing-quantities/">§4</a>), −0.5 to 0.5 |

Image positions alone cannot tell such a sheet apart from a rescaling of the lens mass and the source plane (the mass-sheet degeneracy).
