# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cian Roche's personal academic website, forked from [academicpages](https://github.com/academicpages/academicpages.github.io) (built on the minimal-mistakes Jekyll theme). Static site hosted on GitHub Pages.

## Working with Claude

- Prioritize accuracy and clarity over confident-sounding guesses. If you are not sure a claim about the code is correct, verify it before stating it, or say plainly that you are not sure.
- Do not use em dashes. Use a comma, period, or parentheses instead.
- When multiple reasonable approaches exist and the right one depends on a judgment call only the user can make, ask a clarifying question instead of picking one silently.

## Development commands

- Install deps: `bundle install`
- Run locally: `bundle exec jekyll serve` (serves at `http://localhost:4000`)
- For a dev-tuned config (localhost URL, expanded Sass, disqus dev shortname), layer `_config.dev.yml` on top: `bundle exec jekyll serve --config _config.yml,_config.dev.yml`
- `hawkins` is available (via the Gemfile) as a livereloading alternative to `jekyll serve`
- There is no test suite and no linter configured. Verify changes by running the dev server and checking the page in a browser.
- `package.json`'s `uglify`/`build:js`/`watch:js` scripts rebuild `assets/js/main.min.js` from the theme's stock jQuery/plugin bundle. This pipeline is vestigial from the original theme fork (`main.min.js` hasn't changed since the initial clone). Site-specific interactivity is added elsewhere (see Theming below), not through this bundle.

## Architecture

### Jekyll site (academic content)

Standard Jekyll/minimal-mistakes layout:
- `_pages/`: standalone pages (`about`, `research`, `side_projects`, `tutorials`, `community`, `ethics`, doc pages)
- Collections `_publications/`, `_talks/`, `_teaching/`, `_portfolio/`, `_posts/`: each gets `output: true` and a default layout set in `_config.yml`
- `_layouts/`: page templates. `doc.html` is a custom documentation layout (sticky sidebar TOC, callout styles `doc-key`/`doc-note`/`doc-warning`/`doc-cyan`/`doc-figrow`/`doc-figpair`) used by `_pages/caustica-documentation.md`
- `_includes/`, `_sass/`: theme partials/styles inherited from minimal-mistakes
- `_data/navigation.yml`: top nav links. `_data/authors.yml`, `_data/ui-text.yml`: theme data
- `markdown_generator/` and `talkmap.py`/`talkmap.ipynb`: inherited academicpages helper scripts that scaffold `_publications`/`_talks` markdown from `.bib`/`.tsv` files, not part of the regular editing workflow

### Dark/light theming

Toggled via a `data-theme` attribute on `<html>`, persisted to `localStorage`, and set by inline `<script>` blocks in `_includes/head.html` and `_includes/masthead.html`, not through the compiled `main.min.js` bundle. CSS reacts via `html[data-theme="dark"]` overrides (see `_sass/_dark-mode.scss` and per-partial overrides). Images needing a different asset per theme follow a `-light`/`-dark` (or `_inverted`) filename convention and are swapped with paired `<img class="img-light">`/`<img class="img-dark">` tags toggled by CSS. See `_pages/side_projects.md` for the pattern.

### Standalone interactive demos (`assets/<name>/`)

Several self-contained vanilla-JS apps live under `assets/`, each with its own `index.html`/CSS/JS. They bypass Jekyll layouts and the site theme entirely, and are linked from `_pages/side_projects.md`:
- `assets/caustica/`: the largest, a WebGL2 multiplane gravitational lensing simulator.
  - `lens.js`: pure physics (cosmology, deflection models, critical-curve sampling), no DOM access
  - `renderer.js`: WebGL2 renderer; the multiplane lensing computation runs per-pixel in a single GLSL 300 es fragment shader
  - `main.js` (~4900 lines): app shell, covering `state`, DOM construction, event wiring, sidebar rendering, recording/animation, YAML config save/load
  - Fully documented in `_pages/caustica-documentation.md`, including a "Code structure" section. Read it before making non-trivial changes here.
  - Any change to Caustica's behavior, UI, physics, or code structure must be followed by a check of `_pages/caustica-documentation.md` for accuracy, and an update if it is now out of date. Treat this as a required step of the change, not an optional cleanup
- `assets/chi_by_eye/`: a chi-by-eye statistics intuition-building browser game (`main.js`, `plot.js`, `stats.js`, `round.js`, `sandbox.js`)
- `assets/dark_matter_demo/`, `assets/lensing_demo/`: smaller single-file demos

When editing one of these, treat it as its own small app: no build step, just edit JS/CSS/HTML directly and reload through the Jekyll dev server so relative asset paths resolve (e.g. `http://localhost:4000/assets/caustica/`).
