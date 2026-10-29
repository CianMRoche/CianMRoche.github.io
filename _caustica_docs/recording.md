---
title: "10. Recording, capture, and animation"
nav_title: "10. Recording, capture, and animation"
order: 11
---

**Export** (the download icon) saves the image as a picture, a video, or an animation. Captures show what is on screen in the left (or only) view: the image or map, the overlays (markers, curves, ruler, legend) and the colour bar, with the same light-theme inversion as the screen. Buttons and other controls are not included.

## Still image

**Save PNG** saves the view as `caustica.png`, at the resolution it is computed at (set by **Render scale**, below). **Save SVG (line art)** is described in <a href="/caustica-documentation/critical-curves/#line-art-vector-render-mode">§9</a>.

## Render scale

**Settings** → **Render scale** sets how many pixels are computed per pixel of screen layout, which sets how sharp the image looks and how large a PNG or video frame is. Phones and high-resolution laptop screens have 2 or 3 physical pixels per layout pixel. The scale applies to width and height, so doubling it computes four times as many pixels.

| Mode | Scale | Notes |
|---|---|---|
| Auto (default) | the screen's ratio, at most 2 | On a ratio-3 phone, looks almost the same as Native while computing 44% as many pixels |
| 1× | 1 | Fastest, slightly soft on high-resolution screens; keeps heavy scenes responsive |
| Native | the screen's full ratio | Sharpest, slowest, and the largest PNG |

It changes only sharpness and speed, never the physics. Saved in configs as `renderScale`.

## Video and GIF formats

| Format | Notes |
|---|---|
| WebM | Fast, recorded by the browser. In a programmatic animation, critical curves are left out so frames keep accurate timing. |
| GIF (slower) | Loops automatically and plays almost anywhere, but is slower to make and limited to 256 colours, shared by all frames (so colours do not flicker). Programmatic animations include the critical curves. |

**Frame rate**: 5, 10, 15, 24 or 30 frames per second.

## Free recording

Under **Live**, press **Record** (or **R**), then work with the scene as usual. Frames are captured at the chosen rate. Press **Stop** (or **R**) to finish and download `caustica.webm` or `caustica.gif`. Recording stops by itself after 30 seconds. A GIF takes a few seconds to assemble after you stop; a notice on the image shows the progress, and **Record** is disabled until the file is ready.

## Programmatic animation

For smooth, repeatable motion, use **Programmatic**:

1. Select an object, move it to its start, and click **Set** beside **Initial**. Move it to its end and click **Set** beside **Final**.
2. Click **Add to program**. Repeat for other objects; **Clear all** empties the list.
3. Set the **Duration** (0.5 to 60 s) and click **Record program**. With **Loop** on, the motion plays forward and then backward, so a looping GIF has no jump (this doubles the length).

All listed objects move in straight lines from start to end at the same time, rendered frame by frame at the chosen rate, and saved as `caustica-prog.webm` or `caustica-prog.gif`.

<figure>
  <img class="img-light" src="/images/caustica-prog-2pointmass-light.gif" alt="Programmatic animation of two point-mass lenses moving apart, their critical curves and caustics evolving.">
  <img class="img-dark"  src="/images/caustica-prog-2pointmass.gif"  alt="Programmatic animation of two point-mass lenses moving apart, their critical curves and caustics evolving.">
  <figcaption>A programmatic GIF: two point-mass lenses moving apart in front of a source, with their critical curves (pink) and caustics (green).</figcaption>
</figure>

## Data export (CSV)

**Data (CSV)** saves positions in arcsec. **Curves** saves the critical-curve and caustic segments, one row per segment, labelled `critical` or `caustic` and `tangential` or `radial`, with the source redshift they were computed for. **Image positions** saves the point-source image positions. Each button is available once that data has been computed (show the critical curves, or add a point source).
