---
title: "2. Cosmological distances"
nav_title: "2. Cosmological distances"
order: 3
---

Distances assume a flat universe containing matter and a cosmological constant (flat ΛCDM). You can change $H_0$ and $\Omega_m$ under **Settings** (the gear).

| Symbol | Default | Meaning |
|---|---|---|
| $z$ | | Redshift |
| $H_0$ | 70 km s⁻¹ Mpc⁻¹ | Hubble constant, the present expansion rate (50 to 100) |
| $\Omega_m$ | 0.3 | Fraction of the present energy density in matter (0.05 to 0.6) |
| $\Omega_\Lambda$ | $1 - \Omega_m$ | Fraction in the cosmological constant, fixed so the universe stays flat |
| $c$ | $2.998\times10^5$ km s⁻¹ | Speed of light |

The lensed image, the maps of <a href="/caustica-documentation/lensing-quantities/">§4</a> and the critical curves depend only on ratios of distances, so $H_0$ does not change them; only $\Omega_m$ does. $H_0$ sets the overall distance scale, so the time delays (<a href="/caustica-documentation/lensing-quantities/">§4</a>) scale as $1/H_0$. This is why measured time delays constrain $H_0$.

## Dimensionless Hubble parameter

The expansion rate at redshift $z$, relative to today, is

$$E(z) = \sqrt{\Omega_m(1+z)^3 + \Omega_\Lambda}.$$

## Comoving and angular diameter distances

The comoving distance to redshift $z$ is

$$\chi(z) = D_H \int_0^z \frac{dz'}{E(z')}, \qquad D_H = \frac{c}{H_0} \approx 4283\;\text{Mpc}.$$

Lensing uses angular diameter distances, the ratio of an object's physical size to the angle it covers:

$$D(0,z) = \frac{\chi(z)}{1+z}, \qquad D(z_1, z_2) = \frac{\chi(z_2) - \chi(z_1)}{1+z_2},$$

for the observer to redshift $z$, and from $z_1$ to $z_2 > z_1$ (the second form holds for a flat universe).

## Numerical integration

The integral for $\chi$ is evaluated as a sum over $n = 200$ equal steps in redshift, sampling the middle of each step:

$$\chi(z) \approx D_H\,\Delta z \sum_{i=0}^{n-1} \frac{1}{E\big((i+\tfrac{1}{2})\,\Delta z\big)}, \qquad \Delta z = \frac{z}{n}.$$

The relative error is below 0.005% up to $z = 15$. The distances are recomputed whenever a plane or the cosmology changes, and passed to the GPU as $D(0, z_i)$ for each plane $i$ and $D(z_i, z_j)$ for each pair of planes.
