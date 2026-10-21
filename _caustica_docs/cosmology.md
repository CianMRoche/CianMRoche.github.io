---
title: "2. Cosmological distances"
nav_title: "2. Cosmological distances"
order: 3
---

The simulation uses a spatially flat ΛCDM cosmology. $H_0$ and $\Omega_m$ are adjustable in the Settings tab (the gear icon); the universe is kept flat, so $\Omega_\Lambda = 1 - \Omega_m$. Defaults:

| Symbol | Default | Meaning |
|---|---|---|
| $H_0$ | 70 km s⁻¹ Mpc⁻¹ | Hubble constant (adjustable, 50–100) |
| $\Omega_m$ | 0.3 | Matter density parameter (adjustable, 0.05–0.6) |
| $\Omega_\Lambda$ | $1 - \Omega_m$ | Dark-energy density parameter (flat universe) |
| $c$ | $2.998\times10^5$ km s⁻¹ | Speed of light |

Because the lensed image, the $\kappa/\gamma/\mu$ maps, and the critical curves depend only on ratios of angular-diameter distances, $H_0$ leaves them unchanged and only $\Omega_m$ shifts them. $H_0$ does set the absolute distance scale, so it rescales the physical time delays (<a href="/caustica-documentation/lensing-quantities/">§4</a>): the delays scale as $1/H_0$, which is the basis of time-delay cosmography.

## Dimensionless Hubble parameter

$$E(z) = \sqrt{\Omega_m(1+z)^3 + \Omega_\Lambda}$$

$E(z)$ encodes how the expansion rate changes with redshift.

## Comoving and angular diameter distances

The **comoving distance** to redshift $z$ is:

$$\chi(z) = D_H \int_0^z \frac{dz'}{E(z')}, \qquad D_H = \frac{c}{H_0} \approx 4283\;\text{Mpc}$$

The **angular diameter distances** used in the lensing formula are:

$$D(0,z) = \frac{\chi(z)}{1+z} \qquad \text{(observer to redshift } z\text{)}$$

$$D(z_1, z_2) = \frac{\chi(z_2) - \chi(z_1)}{1+z_2} \qquad \text{(between two redshifts, flat universe)}$$

## Numerical integration

$\chi(z)$ has no closed form and is evaluated with the **midpoint Riemann rule** at $n = 200$ steps:

$$\chi(z) \;\approx\; D_H \cdot \Delta z \cdot \sum_{i=0}^{n-1} \frac{1}{E\left(\bigl(i+\tfrac{1}{2}\bigr)\Delta z\right)}, \qquad \Delta z = \frac{z}{n}$$

For $n = 200$ and $z \leq 5$ the relative error in $\chi$ is below $0.01\%$, negligible for lensing purposes.

Distances are precomputed once whenever the plane configuration changes and packed into two arrays passed to the GPU:

| Array | Entry | Meaning |
|---|---|---|
| `D_obs[i]` | $D(0, z_i)$ | Observer to plane $i$ |
| `D_btwn[i,j]` | $D(z_i, z_j)$ | Between planes $i$ and $j$ |
