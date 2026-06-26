# Caustica documentation figures: capture checklist

The docs page (`_pages/caustica-documentation.md`) references figures that live in
`/images/caustica-docs/`. Each figure has a **dark** and a **light** variant; the page shows
whichever matches the active theme. Until both files exist, the figure renders as a neutral
placeholder box (no broken page).

## How to capture

1. Open `/assets/caustica/` in a browser. Make the window large so the square canvas is high
   resolution (the Save PNG export is the canvas pixel size).
2. Load a preset: Settings tab, **Load YAML**, pick a file from this folder.
3. Set the **theme** with the toggle (top-right of the page): capture once in dark, once in light.
4. Set the **viz mode** (dropdown top-right of the image panel, or the key shortcut) and any
   **overlays** (press `C` for critical curves and caustics) per the table below.
5. Click **Save PNG** (Recording tab). Rename the download to the target filename and move it to
   `/images/caustica-docs/`.

The **UI overview** is the exception: Save PNG exports only the canvas, so capture that one with an
OS or browser screenshot of the whole interface.

## Presets in this folder

| Preset | Scene |
|---|---|
| `single-sie.yaml` | One SIE lens (z=0.5) + Gaussian source (z=1.5). UI overview, source profiles. |
| `compound-lens.yaml` | Main SIE + off-centre companion SIE + external shear (z=0.5) + source (z=1.5). Quantity maps, palettes, critical curves. |
| `two-plane.yaml` | SIE at z=0.4 and z=0.8 + source at z=1.6. Multiplane figure. |
| `fermat-demo.yaml` | SIE (z=0.5) + uniform circle source (z=1.5), source pinned for Fermat. Fermat pair. |

## Figures

All files go in `/images/caustica-docs/`. Names take a `-dark` and a `-light` suffix,
e.g. `mu-dark.png` + `mu-light.png`.

| Figure | Preset | Viz mode | Overlays / notes | Base filename(s) |
|---|---|---|---|---|
| UI overview (top) | `single-sie` | Lensed image (`I`) | OS screenshot of the whole app | `ui` |
| Multiplane (§3) | `two-plane` | Lensed image (`I`) | none | `multiplane` |
| Plane timeline (§3, companion) | `two-plane` | n/a | OS/region screenshot of the redshift timeline + plane setup controls (wider than tall) | `plane-timeline` |
| Quantities gallery (§4) | `compound-lens` | `K`, `G`, `M` in turn | one PNG per mode | `kappa`, `gamma`, `mu` |
| Colormap palettes (§4) | `compound-lens` | Magnification (`M`) | Color Map section: set Colormap to Default, Viridis, Turbo | `cmap-default`, `cmap-viridis`, `cmap-turbo` |
| Fermat surface (§4, left) | `fermat-demo` | Fermat (`T`) | markers I/II/III shown automatically | `fermat` |
| Fermat images (§4, right) | `fermat-demo` | Lensed image (`I`) | same scene; the uniform circle source lenses into images at the marker positions | `fermat-images` |
| Critical curves (§7) | `compound-lens` | Lensed image (`I`) | press `C` to show critical curves + caustics | `crit` |
| Source types (§6) | `single-sie` | Lensed image (`I`) | swap the source model: Point source, Gaussian, Pasted image (for the last, select the Pasted image model and Ctrl+V an image) | `src-pointsource`, `src-gaussian`, `src-pasted` |

The Fermat pair is meant to be read together: keep the same field of view for both so the markers on
the left line up with the lensed images on the right.

Tip: the standard palettes (Viridis, Turbo, etc.) are theme-independent, but the **Default** palette
and the lensed image differ between dark and light, so capture both themes for every figure.
