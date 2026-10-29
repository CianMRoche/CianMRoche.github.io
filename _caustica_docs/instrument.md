---
title: "8. Instrument model"
nav_title: "8. Instrument model"
order: 9
---

**Instrument** (the grid icon) resamples the image onto a real telescope's detector pixels. It applies to the **Lensed image** and **Unlensed** views. It is not the same as **Render scale** (<a href="/caustica-documentation/recording/#render-scale">§10</a>), which sets how finely the sky is computed rather than how coarsely the detector samples it.

**Pixels.** A detector pixel records the average brightness over its area, so each output pixel $(j, k)$ is

$$I_{jk} = \frac{1}{A_{jk}}\int_{A_{jk}} I(\boldsymbol{\theta})\,\mathrm{d}^2\boldsymbol{\theta},$$

where $A_{jk}$ is the pixel's area on the sky and $I(\boldsymbol{\theta})$ the computed brightness. The integral is the mean of the computed samples inside the pixel. Averaging keeps the total brightness and stops thin arcs from breaking up. The pixel grid is centred on $(0, 0)$, as if the telescope were pointed at the lens. Point sources are drawn on top as dots (<a href="/caustica-documentation/source-models/#point-source">§6</a>), so they are not binned or blurred.

**Blur.** With **Include PSF**, the image is first blurred by the telescope's point-spread function (PSF, the image of a single point of light) and then averaged over pixels, the order a real observation applies them in.

<div class="doc-warning" markdown="1">
**Heads up: the PSFs are only Gaussian approximations.** Each is a round Gaussian with the right full width at half maximum (FWHM). Real PSFs have diffraction rings and spikes (JWST, HST, Euclid, Roman), broad wings from atmospheric seeing (Rubin, HSC), or a sharp adaptive-optics core on a broad halo (MUSE, Keck, ELT), so the Gaussian **underestimates the wings** in every case.
</div>

Choose the telescope under **Detector**. **Custom…** lets you type a **Pixel scale** (up to 5″) and **PSF FWHM** (up to 10″). The eye button beside the menu switches the model off and on without losing the choice, for comparing against the full-resolution image. A line below the menu gives the pixel scale, the FWHM, how many pixels span the field, and how many computed samples back each pixel.

The pixel scales are published values (check the references if it matters). The FWHMs are approximations, except the three marked †, which are quoted; use **Custom** for anything quantitative.

| Instrument | Pixel (″) | FWHM (″) | FWHM basis | Pixel-scale reference |
|---|---|---|---|---|
| JWST NIRCam short | 0.031 | 0.062 † | "FWHM 2 pix at 2.0 µm" | [JDox](https://jwst-docs.stsci.edu/), *NIRCam Overview*, Table 1 |
| JWST NIRCam long | 0.063 | 0.126 † | "FWHM 2 pix at 4.0 µm" | [JDox](https://jwst-docs.stsci.edu/), *NIRCam Overview*, Table 1 |
| JWST MIRI | 0.11 | 0.22 † | "FWHM 2 pix at 6.25 µm" | [JDox](https://jwst-docs.stsci.edu/), *MIRI Imaging* |
| HST ACS/WFC | 0.05 | 0.10 | Measured; optics alone give about 0.05 | [ACS Instrument Handbook](https://hst-docs.stsci.edu/acsihb) (0.049″) |
| HST WFC3/IR | 0.128 | 0.15 | $1.03\lambda/D$ at 1.4 µm | [WFC3 Instrument Handbook](https://hst-docs.stsci.edu/wfc3ihb) (0.13″ nominal, 0.1283″ measured) |
| Euclid VIS | 0.10 | 0.17 | Its image-quality requirement; optics alone give about 0.12 | Euclid Collaboration, *Euclid. II. The VIS instrument* |
| Euclid NISP | 0.30 | 0.45 | Set by the coarse pixels | Euclid Collaboration, *Euclid. III. The NISP instrument* |
| Roman WFI | 0.11 | 0.12 | $1.03\lambda/D$ at 1 to 1.5 µm | [Roman WFI](https://roman.gsfc.nasa.gov/); Spergel et al. (2015), [arXiv:1503.03757](https://arxiv.org/abs/1503.03757) |
| Rubin / LSST | 0.20 | 0.70 | Median seeing | [Ivezić et al. (2019), ApJ 873, 111](https://ui.adsabs.harvard.edu/abs/2019ApJ...873..111I/abstract) |
| Subaru HSC | 0.168 | 0.60 | Typical survey seeing | Miyazaki et al. (2018), PASJ 70, S1; [HSC pages](https://www.naoj.org/Projects/HSC/) |
| VLT MUSE (NFM) | 0.025 | 0.07 | Adaptive-optics core, about $1.03\lambda/D$ in the red | [ESO MUSE User Manual](https://www.eso.org/sci/facilities/paranal/instruments/muse.html) (narrow-field mode; wide-field is 0.2″) |
| Keck NIRC2 (narrow) | 0.00994 | 0.055 | Adaptive-optics core, $1.03\lambda/D$ at 2.2 µm | [Keck NIRC2 pages](https://www2.keck.hawaii.edu/inst/nirc2/) (later measured as 9.952 and 9.971 mas: Yelda et al. 2010, Service et al. 2016) |
| ELT MICADO | 0.004 | 0.010 | Adaptive-optics core, $1.03\lambda/D$ at 1.6 µm | [ESO MICADO pages](https://elt.eso.org/instrument/MICADO/) (wide-field mode; a 1.5 mas mode also exists) |

Here $\lambda$ is the wavelength and $D$ the mirror diameter: 6.5 m for JWST, 2.4 m for HST and Roman, 1.2 m for Euclid, 10 m for Keck and 39 m for the ELT. $1.03\lambda/D$ is the FWHM of a perfect telescope's PSF. (The more familiar $1.22\lambda/D$ is the radius of its first dark ring, about 19% larger.) The three quoted JWST values fall within 10% of $1.03\lambda/D$. MIRI covers 5.6 to 25.5 µm and its FWHM grows as $2\,\text{pix} \times (\lambda/6.25\,\text{µm})$ above 6.25 µm (0.35″ at 10 µm, 0.90″ at 25 µm), so use **Custom** when the filter matters.

The list covers survey telescopes that discover lenses (Euclid, Roman, Rubin, HSC), telescopes used to model them in detail (HST, JWST NIRCam), and high-resolution follow-up (MUSE, Keck, ELT). MIRI is used more for studying lensed sources than for lens modelling.

**When it cannot be applied.** Each detector pixel needs at least 2 computed samples across it: $s = pW/\text{FOV} \geq 2$, with $p$ the pixel scale and $W$ the image width in computed pixels. Otherwise the detector is finer than what was computed, so the model is skipped and a **Detector too high resolution!** warning lists the fixes that apply: a FOV below $pW/2$, a higher **Render scale** (offered only when the screen allows one), or, for **Custom**, a pixel scale above $2\,\text{FOV}/W$. The opposite case is not an error: Rubin's 0.2″ pixels across a 1″ field really do give five pixels, and the panel says so.

**Configs.** Saved as `instrument`, `instrPixel` and `instrPsfFwhm` (used only for `custom`), `instrPsf` and `instrHidden`.
