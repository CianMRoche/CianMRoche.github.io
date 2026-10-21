---
title: "8. Instrument model"
nav_title: "8. Instrument model"
order: 9
---

The **Instrument** section of the View tab resamples the lensed image onto a real telescope's detector. It is a measurement model, distinct from **Render scale** (<a href="/caustica-documentation/recording/">§10</a>), which sets how finely the sky is *computed* rather than how coarsely it is *sampled*, and it applies to the lensed-image view only.

**Pixel binning.** A detector pixel records the mean surface brightness over its solid angle, so each output pixel is an area average,

$$I_{jk} = \frac{1}{A_{jk}}\int_{A_{jk}} I(\boldsymbol{\theta})\,\mathrm{d}^2\boldsymbol{\theta},$$

evaluated as an $s \times s$ stratified sum over the rendered samples inside pixel $(j,k)$. Averaging, rather than point-sampling a coarser grid, is what conserves flux and stops thin arcs and point-source images aliasing. The grid is centred on the optical axis, as if the telescope had been pointed at the lens. With **Include PSF** the sky is convolved first and integrated over pixels second, the order a real observation applies them in.

<div class="doc-warning" markdown="1">
**Warning: PSFs used are just Gaussian approximations.** The convolution is a circular Gaussian matched only at half maximum. The real profiles are Airy patterns with rings and diffraction spikes (JWST, HST, Euclid, Roman), Moffat-like seeing with much heavier wings (Rubin, HSC), or an AO core on a broad halo (MUSE, Keck, ELT). This **underestimates the wings** in every case.
</div>

Pixel scales are published values, but there may be mistakes. Check the cited references if youre uncertain. The FWHM column is **not** quoted from those references except the three marked †; the rest are approximations, to be replaced via **Custom** for anything quantitative.

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

**Why these instruments?** Discovery surveys (Euclid, Roman, Rubin, HSC), resolved modelling (HST ACS/WFC and WFC3/IR, JWST NIRCam), and high resolution on individual systems (MUSE, Keck, ELT). MIRI is the weakest fit, more frequently used for lensed-source astrophysics rather than lens modelling.

**When it cannot be applied.** With $W$ the canvas width in computed pixels, the rendered samples spanning one detector pixel are $s = pW/\text{fov}$. Below $s = 2$ the detector samples the sky more finely than the shader computes it, so the model is **skipped** — the un-binned frame is then the honest picture — and a *Detector too high resolution* warning names only the levers that apply: reduce the field below $pW/2$, which always works and, since $s \propto 1/\text{fov}$, identifies a wide field as the hard case; try a higher **Render scale**, offered only when the display's pixel ratio exceeds what the current mode uses, as Auto already caps it at 2; or raise the **Pixel scale** above $2\,\text{fov}/W$, offered only for a **Custom** detector. The opposite corner is not an error: Rubin's 0.2″ pixels across a 1″ field leave five pixels, which is genuinely what Rubin delivers there.

**Implementation and config.** The scene renders into an offscreen framebuffer covering a slightly wider field (so every edge pixel is whole), is optionally blurred by two separable Gaussian passes, then binned onto the pixel grid on the way to the canvas. The first pass needs only $s$ samples per detector pixel, so a coarse detector on a small field is *less* work than an unbinned frame; framebuffers and post-process programs are built lazily. An **eye button** beside the dropdown takes the model off the plot without losing the selection, for flipping against the full-resolution image. Stored as `instrument`, `instrPixel` and `instrPsfFwhm` (consulted only for `custom`), `instrPsf` and `instrHidden`.
