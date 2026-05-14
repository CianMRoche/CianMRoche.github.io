// Chi By Eye - main entry & game state machine.

import { sigmaToChi2, chi2ToSigma } from './stats.js';
import { DIFFICULTIES, makeRound } from './round.js';
import { Plot } from './plot.js';

// ---------- theme: keep in sync with the rest of the site ----------
(function () {
  const t = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', t);
})();

// ---------- constants ----------
const ROUNDS_PER_GAME = 5;
const SIGMA_SLIDER_MAX = 5;       // slider range 0 .. SIGMA_SLIDER_MAX; the
                                  // max position represents "≥ this σ"
const SIGMA_SLIDER_STEP = 0.01;
const SIGMA_TICK_MARKS = [0, 1, 2, 3, 4, 5];
const BASE_SCORE_PER_ROUND = 1000;
// Scoring: full points if guess is within FULL_TOL sigma of truth; falls
// to zero at MAX_ERR sigma with a quadratic curve.
const FULL_TOL = 0.08;
const MAX_ERR = 2.0;

// Persisted preference: show per-point χ² contribution labels on the
// in-round reveal plot. Default off; the toggle lives on the reveal banner.
// This preference does NOT propagate to the end-of-game summary mini-plots.
const CHI2_LABELS_PREF_KEY = 'chiByEye.showChi2Labels';
function getChi2LabelsPref() {
  try { return localStorage.getItem(CHI2_LABELS_PREF_KEY) === 'true'; }
  catch { return false; }
}
function setChi2LabelsPref(val) {
  try {
    if (val) localStorage.setItem(CHI2_LABELS_PREF_KEY, 'true');
    else     localStorage.removeItem(CHI2_LABELS_PREF_KEY);
  } catch { /* ignore */ }
}

// ---------- game state ----------
const State = {
  MENU: 'menu',
  ROUND: 'round',
  REVEAL: 'reveal',
  SUMMARY: 'summary',
};

const game = {
  state: State.MENU,
  difficulty: 'intermediate',
  timed: false,
  timerSeconds: 60,
  roundIndex: 0,             // 0..ROUNDS_PER_GAME-1
  rounds: [],                // current game's round data
  guesses: [],               // user sigma per round
  scores: [],                // score per round
  totalScore: 0,
  timerEndTime: 0,
  timerHandle: null,
};

// ---------- DOM refs (assigned in init) ----------
let app, menuEl, topbarEl, stageEl, plotWrapEl, canvasEl, hudTlEl, hudTrEl,
    controlsEl, sliderEl, sliderValEl, submitBtn, revealBannerEl,
    summaryEl, exitLinkEl, plot;

// ---------- bootstrap ----------
window.addEventListener('DOMContentLoaded', init);

function init() {
  app = document.getElementById('app');
  buildShell();
  showMenu();
}

// Build the long-lived DOM scaffold once. We swap visibility/content as
// the state machine moves around.
function buildShell() {
  app.innerHTML = `
    <div class="topbar hidden" id="topbar">
      <div class="left">
        <div class="title"><span style="font-family:'Times New Roman',serif;font-style:italic;">&chi;</span> by eye</div>
        <div class="meta">Round <b id="round-num">1</b> / ${ROUNDS_PER_GAME}</div>
        <div class="meta">Difficulty <b id="diff-name">—</b></div>
      </div>
      <div class="right">
        <div class="meta timer hidden" id="timer">Time <b id="timer-val">—</b></div>
        <div class="meta">Score <b id="score-val">0</b></div>
        <a class="exit" href="#" id="exit-link">Quit</a>
      </div>
    </div>

    <div class="stage" id="stage">
      <div class="plot-wrap" id="plot-wrap">
        <canvas id="plot-canvas"></canvas>
        <div class="plot-hud plot-hud-tl hidden" id="hud-tl">
          <span class="hud-item"><span class="hud-k">N</span><span class="hud-v" id="hud-N">—</span></span>
          <span class="hud-item"><span class="hud-k">k</span><span class="hud-v" id="hud-k">—</span></span>
          <span class="hud-item"><span class="hud-k">dof</span><span class="hud-v" id="hud-dof">—</span></span>
          <span class="hud-badge hidden" id="hud-logy">log y</span>
          <button class="hud-info" id="hud-info-btn" aria-label="Symbol legend">i</button>
        </div>
        <div class="plot-hud plot-hud-tr hidden" id="hud-tr">
          <span class="hud-sigma" id="readout-sigma">1.00&sigma;</span>
          <span class="hud-arrow-double">&hArr;</span>
          <span class="hud-item"><span class="hud-k">&chi;&sup2;</span><span class="hud-v" id="readout-chi">—</span></span>
          <span class="hud-item"><span class="hud-k">&chi;&sup2;/dof</span><span class="hud-v" id="readout-red">—</span></span>
        </div>
        <div class="hud-popover hidden" id="hud-popover">
          <div class="popover-row"><span class="popover-k">N</span><span class="popover-v">number of data points</span></div>
          <div class="popover-row"><span class="popover-k">k</span><span class="popover-v">free model parameters</span></div>
          <div class="popover-row"><span class="popover-k">dof</span><span class="popover-v">degrees of freedom (N &minus; k)</span></div>
          <div class="popover-row"><span class="popover-k">&chi;&sup2;</span><span class="popover-v">&Sigma;<sub>i</sub> (residual<sub>i</sub> / &sigma;<sub>i</sub>)&sup2;, given your slider &sigma;</span></div>
          <div class="popover-row"><span class="popover-k">&chi;&sup2;/dof</span><span class="popover-v">reduced &chi;&sup2;; &asymp; 1 for a good fit</span></div>
          <div class="popover-row"><span class="popover-k">&sigma;</span><span class="popover-v">two-sided tension equivalent of the &chi;&sup2; p-value</span></div>
        </div>
        <div class="reveal-banner hidden" id="reveal-banner">
          <div class="rb-pairs">
            <div class="pair primary">
              <span class="k">Your guess</span>
              <span class="v" id="rb-user">—</span>
            </div>
            <div class="pair primary">
              <span class="k">Truth</span>
              <span class="v" id="rb-true">—</span>
            </div>
            <div class="pair secondary">
              <span class="k">True &chi;&sup2;</span>
              <span class="v" id="rb-chi2">—</span>
            </div>
            <div class="pair secondary">
              <span class="k">True &chi;&sup2;/dof</span>
              <span class="v" id="rb-red">—</span>
            </div>
            <div class="pair score">
              <span class="k">Score</span>
              <span class="v" id="rb-score">—</span>
            </div>
          </div>
          <div class="rb-actions">
            <label class="rb-toggle" title="Annotate each data point with its (residual/σ)² → contribution">
              <input type="checkbox" id="rb-labels-toggle">
              <span>show &chi;&sup2; contributions</span>
            </label>
            <button class="rb-hide" id="rb-hide" type="button" title="Hide details to see the plot" aria-label="Hide details">
              <span class="rb-hide-caret">&#x25BC;</span>
            </button>
            <button class="primary next-btn" id="rb-next">Next</button>
          </div>
        </div>
        <button class="reveal-restore hidden" id="reveal-restore" type="button" title="Show round details">
          <span>Round details</span>
          <span class="restore-caret">&#x25B2;</span>
        </button>
      </div>

      <div class="controls hidden" id="controls">
        <div class="label">tension</div>
        <div class="slider-with-ticks">
          <input type="range" class="sigma" id="sigma-slider"
                 min="0" max="${SIGMA_SLIDER_MAX}" step="${SIGMA_SLIDER_STEP}" value="1">
          <div class="slider-truth hidden" id="slider-truth" aria-hidden="true">
            <div class="truth-bar"></div>
            <div class="truth-label">truth</div>
          </div>
          <div class="slider-ticks" id="slider-ticks"></div>
        </div>
        <div class="value" id="sigma-val">1.00&sigma;</div>
        <button class="primary" id="submit-btn">Submit</button>
      </div>

      <div class="menu" id="menu">
        ${menuMarkup()}
      </div>

      <div class="summary hidden" id="summary"></div>
    </div>
  `;

  // Cache refs
  topbarEl = document.getElementById('topbar');
  menuEl = document.getElementById('menu');
  stageEl = document.getElementById('stage');
  plotWrapEl = document.getElementById('plot-wrap');
  canvasEl = document.getElementById('plot-canvas');
  hudTlEl = document.getElementById('hud-tl');
  hudTrEl = document.getElementById('hud-tr');
  controlsEl = document.getElementById('controls');
  sliderEl = document.getElementById('sigma-slider');
  sliderValEl = document.getElementById('sigma-val');
  submitBtn = document.getElementById('submit-btn');
  revealBannerEl = document.getElementById('reveal-banner');
  summaryEl = document.getElementById('summary');
  exitLinkEl = document.getElementById('exit-link');

  // Slider tick labels. The last tick is marked "Nσ+" because the slider's
  // maximum position represents "≥ Nσ" — anything above just clamps here.
  const ticksEl = document.getElementById('slider-ticks');
  ticksEl.innerHTML = SIGMA_TICK_MARKS
    .map((v, i, arr) => {
      const suffix = (i === arr.length - 1) ? '+' : '';
      return `<span>${v}&sigma;${suffix}</span>`;
    }).join('');

  plot = new Plot(canvasEl);

  // Event handlers
  sliderEl.addEventListener('input', onSliderInput);
  submitBtn.addEventListener('click', onSubmit);
  document.getElementById('rb-next').addEventListener('click', onNext);
  exitLinkEl.addEventListener('click', e => { e.preventDefault(); confirmQuit(); });
  // Per-point χ² contribution toggle on the reveal banner
  document.getElementById('rb-labels-toggle').addEventListener('change', e => {
    const v = !!e.target.checked;
    setChi2LabelsPref(v);
    plot.setChi2LabelsVisible(v);
  });
  // Hide / restore the reveal banner so the player can inspect the plot
  document.getElementById('rb-hide').addEventListener('click', hideReveal);
  document.getElementById('reveal-restore').addEventListener('click', showReveal);

  // Info popover toggle
  const infoBtn = document.getElementById('hud-info-btn');
  const popoverEl = document.getElementById('hud-popover');
  infoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    popoverEl.classList.toggle('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!popoverEl.contains(e.target) && e.target !== infoBtn) {
      popoverEl.classList.add('hidden');
    }
  });

  // Keyboard: Enter to submit / advance
  document.addEventListener('keydown', onKeyDown);

  // Menu setup
  attachMenuHandlers();
}

// Per-difficulty feature list rendered on the difficulty cards.
// First line is the score multiplier; subsequent lines describe what changes
// from the previous tier (using "all from X" inheritance language to keep
// the cards compact).
const DIFFICULTY_FEATURES = {
  easy: [
    '5–8 data points',
    'linear y axis',
    'uniform error bars',
  ],
  intermediate: [
    'all from Easy',
    '7–12 data points',
  ],
  challenging: [
    'all from Intermediate',
    'log y axis sometimes',
    'variable bar sizes',
  ],
  hard: [
    'all from Challenging',
    '12–20 data points',
    'error bars rotated',
  ],
  impossible: [
    'all from Challenging',
    '12–20 data points',
    'no bars — sample clouds',
  ],
};

function menuMarkup() {
  const diffEntries = Object.entries(DIFFICULTIES);
  const diffBtns = diffEntries.map(([key, d]) => {
    const features = DIFFICULTY_FEATURES[key] || [];
    const bullets = features.map(f => `<li>${f}</li>`).join('');
    return `<div class="diff-cell" data-diff="${key}">
       <button data-diff="${key}" class="${key === 'intermediate' ? 'selected' : ''}">
         <span class="dname">${d.name}</span>
         <span class="dmult">&times;${d.scoreMultiplier.toFixed(1)} score</span>
       </button>
       <ul class="dfeatures">${bullets}</ul>
     </div>`;
  }).join('');
  return `
    <h1><span class="chi">&chi;</span> by eye</h1>
    <p class="tagline">
      Estimate how many &sigma; the data is in tension with the model. Five rounds per game. New to &chi;&sup2;?
      <button type="button" class="tutorial-link" id="tutorial-link">walk through the tutorial &rarr;</button>
    </p>
    <div class="diff-grid">${diffBtns}</div>
    <div class="option-row">
      <label>
        <input type="checkbox" id="timed-toggle">
        Timed mode
      </label>
      <label style="opacity:0.6;" id="timer-len-label">
        seconds per round
        <input type="number" id="timer-len" value="60" min="5" max="600" disabled>
      </label>
    </div>
    <button class="primary start-btn" id="start-btn">Start game</button>
    <div class="footer-note">
      Convention: two-sided &sigma; equivalent of the
      &chi;&sup2; upper-tail probability, common in astrophysics.
    </div>
  `;
}

function attachMenuHandlers() {
  // Difficulty buttons
  menuEl.querySelectorAll('.diff-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      menuEl.querySelectorAll('.diff-grid button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      game.difficulty = btn.dataset.diff;
    });
  });
  // Timed toggle
  const timedToggle = document.getElementById('timed-toggle');
  const timerLen = document.getElementById('timer-len');
  const timerLenLabel = document.getElementById('timer-len-label');
  timedToggle.addEventListener('change', () => {
    timerLen.disabled = !timedToggle.checked;
    timerLenLabel.style.opacity = timedToggle.checked ? '1' : '0.6';
  });
  document.getElementById('start-btn').addEventListener('click', () => {
    game.timed = timedToggle.checked;
    game.timerSeconds = Math.max(5, Math.min(600, parseInt(timerLen.value) || 60));
    startGame();
  });
  // Tutorial link
  const tutLink = document.getElementById('tutorial-link');
  if (tutLink) tutLink.addEventListener('click', startTutorial);
}

// ---------- state transitions ----------
function showMenu() {
  game.state = State.MENU;
  topbarEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  hudTlEl.classList.add('hidden');
  hudTrEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  document.getElementById('slider-truth').classList.add('hidden');
  summaryEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
}

function startGame() {
  game.roundIndex = 0;
  game.rounds = [];
  game.guesses = [];
  game.scores = [];
  game.totalScore = 0;
  document.getElementById('diff-name').textContent = DIFFICULTIES[game.difficulty].name;
  // running score shown as X / Y; Y grows after each round
  document.getElementById('score-val').innerHTML = '0 <span class="score-denom">/ 0</span>';
  document.getElementById('timer').classList.toggle('hidden', !game.timed);
  menuEl.classList.add('hidden');
  summaryEl.classList.add('hidden');
  topbarEl.classList.remove('hidden');
  beginRound();
}

function beginRound() {
  game.state = State.ROUND;
  document.getElementById('round-num').textContent = String(game.roundIndex + 1);
  controlsEl.classList.remove('hidden');
  hudTlEl.classList.remove('hidden');
  hudTrEl.classList.remove('hidden');
  revealBannerEl.classList.add('hidden');

  const r = makeRound(game.difficulty);
  game.rounds.push(r);

  // Populate top-left HUD
  document.getElementById('hud-N').textContent = String(r.N);
  document.getElementById('hud-k').textContent = String(r.k);
  document.getElementById('hud-dof').textContent = String(r.dof);
  document.getElementById('hud-logy').classList.toggle('hidden', !r.logY);

  // Reset slider to a centered value (1.0σ feels neutral)
  sliderEl.value = '1.0';
  sliderEl.disabled = false;
  submitBtn.disabled = false;
  updateSliderDisplay();

  const D = DIFFICULTIES[game.difficulty];
  plot.setRound(r, {
    rotate: D.perPointRotation,
    sampledErrorbars: D.sampledErrorbars,
  });
  // Hide χ² contribution labels during play — they only appear on reveal,
  // and only if the user has the preference turned on.
  plot.setChi2LabelsVisible(false);
  // Clear the truth marker from any previous round
  document.getElementById('slider-truth').classList.add('hidden');

  // Timer
  if (game.timed) {
    game.timerEndTime = performance.now() + game.timerSeconds * 1000;
    tickTimer();
  }
}

function updateSliderDisplay() {
  const sigma = parseFloat(sliderEl.value);
  // Append "+" when pinned at the slider's maximum to signal "or more".
  const atMax = sigma >= SIGMA_SLIDER_MAX - 1e-6;
  const sigmaText = `${sigma.toFixed(2)}&sigma;${atMax ? '+' : ''}`;
  sliderValEl.innerHTML = sigmaText;
  const r = game.rounds[game.roundIndex];
  if (!r) return;
  const chi2 = sigmaToChi2(sigma, r.dof);
  const red = chi2 / r.dof;
  // top-right HUD: σ value matches slider so connection is obvious
  document.getElementById('readout-sigma').innerHTML = sigmaText;
  document.getElementById('readout-chi').textContent = chi2.toFixed(2);
  document.getElementById('readout-red').textContent = red.toFixed(2);
}

function onSliderInput() {
  if (game.state !== State.ROUND) return;
  updateSliderDisplay();
}

function onSubmit() {
  if (game.state !== State.ROUND) return;
  finalizeRound(parseFloat(sliderEl.value));
}

function finalizeRound(userSigma) {
  stopTimer();
  const r = game.rounds[game.roundIndex];
  game.guesses.push(userSigma);
  // If the true sigma exceeds the slider's max, the user can't possibly reach
  // it — clamp the effective truth to the slider max for scoring purposes so
  // a guess at the high end still wins.
  const effectiveTrue = Math.min(r.trueSigma, SIGMA_SLIDER_MAX);
  const mult = DIFFICULTIES[game.difficulty].scoreMultiplier;
  const score = computeScore(userSigma, effectiveTrue, mult);
  const roundMax = BASE_SCORE_PER_ROUND * mult;
  game.scores.push(score);
  game.totalScore += score;
  const totalMax = roundMax * (game.roundIndex + 1);
  document.getElementById('score-val').innerHTML =
    `${Math.round(game.totalScore).toLocaleString()} <span class="score-denom">/ ${totalMax.toLocaleString()}</span>`;

  // Reveal mode on plot — apply the user's "show χ² contributions" preference
  plot.setRevealed(true, userSigma);
  const showLabels = getChi2LabelsPref();
  plot.setChi2LabelsVisible(showLabels);
  document.getElementById('rb-labels-toggle').checked = showLabels;
  // Mark the truth on the slider (clamped to slider max for off-scale cases)
  const truthPct = (Math.min(r.trueSigma, SIGMA_SLIDER_MAX) / SIGMA_SLIDER_MAX) * 100;
  const truthEl = document.getElementById('slider-truth');
  truthEl.style.left = `${truthPct}%`;
  truthEl.classList.remove('hidden');

  // Banner — show real trueSigma, true χ²/χ²/dof, and round score out of max.
  const trueLabel = r.trueSigma > SIGMA_SLIDER_MAX
    ? `${r.trueSigma.toFixed(2)}&sigma; <span class="off-scale">(off-scale)</span>`
    : `${r.trueSigma.toFixed(2)}&sigma;`;
  document.getElementById('rb-user').innerHTML  = `${userSigma.toFixed(2)}&sigma;`;
  document.getElementById('rb-true').innerHTML  = trueLabel;
  document.getElementById('rb-chi2').textContent = r.chi2.toFixed(2);
  document.getElementById('rb-red').textContent  = r.redChi2.toFixed(2);
  document.getElementById('rb-score').innerHTML  =
    `${Math.round(score).toLocaleString()} <span class="score-denom">/ ${Math.round(roundMax).toLocaleString()}</span>`;
  revealBannerEl.classList.remove('hidden');

  sliderEl.disabled = true;
  submitBtn.disabled = true;
  game.state = State.REVEAL;
}

function onNext() {
  if (game.state !== State.REVEAL) return;
  // Make sure both reveal banner and the restore-button are tidied up before
  // the next round renders.
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  game.roundIndex++;
  if (game.roundIndex >= ROUNDS_PER_GAME) {
    showSummary();
  } else {
    beginRound();
  }
}

function hideReveal() {
  if (game.state !== State.REVEAL) return;
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.remove('hidden');
}
function showReveal() {
  if (game.state !== State.REVEAL) return;
  revealBannerEl.classList.remove('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
}

function computeScore(userSigma, trueSigma, mult) {
  const err = Math.abs(userSigma - trueSigma);
  if (err <= FULL_TOL) return BASE_SCORE_PER_ROUND * mult;
  if (err >= MAX_ERR)  return 0;
  // Smooth fall-off: quadratic feels nicer than linear (near-misses still good)
  const t = (err - FULL_TOL) / (MAX_ERR - FULL_TOL);
  const f = 1 - t * t;
  return BASE_SCORE_PER_ROUND * mult * Math.max(0, f);
}

function showSummary() {
  stopTimer();
  game.state = State.SUMMARY;
  controlsEl.classList.add('hidden');
  hudTlEl.classList.add('hidden');
  hudTrEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  plot.stopAnimation();

  const maxPerRound = BASE_SCORE_PER_ROUND * DIFFICULTIES[game.difficulty].scoreMultiplier;
  const maxTotal = maxPerRound * ROUNDS_PER_GAME;
  const total = Math.round(game.totalScore);
  // Award a crown for >90% of the maximum possible.
  const earnedCrown = total >= 0.9 * maxTotal;
  const crownSvg = earnedCrown ? `
    <svg class="crown" viewBox="0 0 24 24" width="28" height="28" aria-label="High score" role="img">
      <path d="M3 18 L3 8.5 L7.5 13 L12 5 L16.5 13 L21 8.5 L21 18 Z" fill="currentColor"/>
      <rect x="3" y="18" width="18" height="2.4" fill="currentColor"/>
      <circle cx="3"  cy="7"   r="1.2" fill="currentColor"/>
      <circle cx="12" cy="3.7" r="1.3" fill="currentColor"/>
      <circle cx="21" cy="7"   r="1.2" fill="currentColor"/>
    </svg>` : '';

  let panels = '';
  for (let i = 0; i < game.rounds.length; i++) {
    const r = game.rounds[i];
    panels += `
      <div class="panel">
        <div class="ptop">
          <span>Round ${i + 1}</span>
          <span>dof ${r.dof}</span>
        </div>
        <canvas data-mini="${i}"></canvas>
        <div class="row"><span class="k">your guess</span><span>${game.guesses[i].toFixed(2)}&sigma;</span></div>
        <div class="row"><span class="k">true</span><span>${r.trueSigma.toFixed(2)}&sigma;${r.trueSigma > SIGMA_SLIDER_MAX ? ' <span style="color:var(--muted);font-size:10px;">off-scale</span>' : ''}</span></div>
        <div class="row"><span class="k">&chi;&sup2;</span><span>${r.chi2.toFixed(2)}  (&chi;&sup2;/dof = ${r.redChi2.toFixed(2)})</span></div>
        <div class="mini-slider">
          <div class="track"></div>
          ${miniSliderMarker('user', game.guesses[i])}
          ${miniSliderMarker('truth', r.trueSigma)}
        </div>
        <div class="row score-row"><span>+${Math.round(game.scores[i])}</span><span class="k">of ${Math.round(maxPerRound)}</span></div>
      </div>
    `;
  }

  summaryEl.innerHTML = `
    <div class="top">
      <h2>Game complete · ${DIFFICULTIES[game.difficulty].name}</h2>
      <div class="total">${crownSvg}<span class="total-num">${total.toLocaleString()}</span><span class="denom"> / ${maxTotal.toLocaleString()}</span></div>
    </div>
    <div class="grid">${panels}</div>
    <div class="actions">
      <button class="primary" id="play-again">Play again</button>
      <button id="back-menu">Back to menu</button>
    </div>
  `;
  summaryEl.classList.remove('hidden');

  // Render mini plots in revealed mode (compact: no axis labels, tighter pad)
  // Keep references so we can destroy them on summary teardown.
  if (game._miniPlots) game._miniPlots.forEach(p => p.destroy());
  game._miniPlots = [];
  for (let i = 0; i < game.rounds.length; i++) {
    const c = summaryEl.querySelector(`canvas[data-mini="${i}"]`);
    const p = new Plot(c, { compact: true });
    p.setRound(game.rounds[i], { rotate: false, sampledErrorbars: false });
    p.setRevealed(true);
    p.stopAnimation();
    game._miniPlots.push(p);
  }

  document.getElementById('play-again').addEventListener('click', startGame);
  document.getElementById('back-menu').addEventListener('click', () => {
    showMenu();
    // Re-render menu just in case state stale
    menuEl.innerHTML = menuMarkup();
    attachMenuHandlers();
  });
}

function miniSliderMarker(cls, sigma) {
  const pct = Math.max(0, Math.min(1, sigma / SIGMA_SLIDER_MAX)) * 100;
  return `<div class="marker ${cls}" style="left:${pct}%"></div>`;
}

// ---------- timer ----------
function tickTimer() {
  if (game.state !== State.ROUND || !game.timed) return;
  const remaining = Math.max(0, game.timerEndTime - performance.now());
  const sec = Math.ceil(remaining / 1000);
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  const tEl = document.getElementById('timer');
  document.getElementById('timer-val').textContent = `${min}:${String(s).padStart(2, '0')}`;
  tEl.classList.toggle('warn', sec <= 5);
  if (remaining <= 0) {
    // Auto-submit current value when time runs out
    finalizeRound(parseFloat(sliderEl.value));
    return;
  }
  game.timerHandle = setTimeout(tickTimer, 250);
}
function stopTimer() {
  if (game.timerHandle != null) {
    clearTimeout(game.timerHandle);
    game.timerHandle = null;
  }
}

// ---------- keyboard ----------
function onKeyDown(e) {
  if (e.target.tagName === 'INPUT' && e.target.type === 'number') return;
  // During the tutorial, hijack the keys: Enter advances the walkthrough,
  // Escape quits it, and game shortcuts are suppressed.
  if (tutorial.active) {
    if (e.key === 'Enter') { e.preventDefault(); tutorialNext(); }
    else if (e.key === 'Escape') { e.preventDefault(); endTutorial(); }
    return;
  }
  if (e.key === 'Enter') {
    if (game.state === State.ROUND) onSubmit();
    else if (game.state === State.REVEAL) onNext();
  } else if (e.key === 'ArrowLeft' && game.state === State.ROUND) {
    sliderEl.stepDown(); onSliderInput();
  } else if (e.key === 'ArrowRight' && game.state === State.ROUND) {
    sliderEl.stepUp(); onSliderInput();
  }
}

function confirmQuit() {
  if (game.state === State.MENU) return;
  if (game.state === State.SUMMARY || confirm('Quit current game and return to menu?')) {
    stopTimer();
    plot.stopAnimation();
    summaryEl.classList.add('hidden');
    showMenu();
    menuEl.innerHTML = menuMarkup();
    attachMenuHandlers();
  }
}

// ============================================================================
//  Tutorial
// ============================================================================
//
// A linear walkthrough triggered from the menu. Each step optionally targets a
// real UI element (highlighted with a spotlight + dim) and shows a tooltip with
// an explanation. Several steps reveal the plot incrementally — empty plot, then
// data, then the model curve, then χ² contributions in color — to teach how the
// χ² number gets built.

function makeTutorialRound() {
  // Linear model with k=2 free parameters (intercept + slope).
  const f = x => 0.35 + 0.45 * x;
  // Hand-tuned data: mostly clean, one clear outlier so the χ²-contribution
  // coloring has interesting variation. Errors all equal so easy mode feel.
  const raw = [
    { x: 0.10, yObs: 0.41 },
    { x: 0.25, yObs: 0.45 },
    { x: 0.40, yObs: 0.53 },
    { x: 0.55, yObs: 0.72 }, // outlier
    { x: 0.70, yObs: 0.69 },
    { x: 0.85, yObs: 0.74 },
  ];
  const err = 0.05;
  const points = raw.map(p => ({
    x: p.x, yObs: p.yObs, yTrue: f(p.x), err, rotRate: 0,
  }));
  const N = points.length;
  const k = 2;
  const dof = N - k;
  let chi2 = 0;
  for (const p of points) chi2 += ((p.yObs - p.yTrue) / p.err) ** 2;
  return {
    f, points, N, k, dof,
    logY: false,
    yMin: 0.20, yMax: 1.00,
    curveYMin: f(0), curveYMax: f(1),
    chi2,
    redChi2: chi2 / dof,
    trueSigma: chi2ToSigma(chi2, dof),
    labels: { x: 'voltage on wire', y: 'oyster fluffiness' },
    difficulty: 'tutorial',
    sigmaTrueFrac: err / (1.0 - 0.2),
    errFactor: 1,
  };
}

const TUTORIAL_STEPS = [
  {
    label: 'Welcome',
    text: '<strong>χ by eye</strong> is a game about estimating, by eye, how well a model ' +
          "fits noisy data. First a quick tour of the screen, then we'll walk through a worked example.",
    target: null,
  },
  {
    label: 'The plot',
    text: 'Each round, a model curve and some noisy data points appear here. ' +
          "You're judging how well they agree.",
    target: '#plot-wrap',
    arrow: 'right',
  },
  {
    label: 'Round info',
    text: 'Top-left tells you the round setup: <span class="math">N</span> data points, ' +
          '<span class="math">k</span> free parameters in the model, and ' +
          '<span class="math">dof = N − k</span> degrees of freedom.',
    target: '#hud-tl',
    arrow: 'below',
  },
  {
    label: 'Your input',
    text: 'The slider is where you input how well you think the model describes the data. You pick how many <span class="math">σ</span> the ' +
          'data is in tension with the model',
    target: '.controls',
    arrow: 'above',
  },
  {
    label: 'Live readout',
    text: 'Top-right shows your slider <span class="math">σ</span> in two equivalent forms — ' +
          '<span class="math">χ²</span> and <span class="math">χ²/dof</span> — for this ' +
          "round's dof. Move the slider and all three change together.",
    target: '#hud-tr',
    arrow: 'below',
  },
  {
    label: 'Demo: empty plot',
    text: "Now let's actually look at some data, building intuition piece by piece.",
    target: '#plot-wrap',
    arrow: 'right',
    action: () => plot.setVisibility({ showData: false, showCurve: false }),
  },
  {
    label: 'Demo: the data',
    text: 'Here are six measurements of some dependent variable as a function of some independent variable. The vertical bar through each point is its (assumed Gaussian) uncertainty ' +
          '<span class="math">σᵢ</span>.',
    target: '#plot-wrap',
    arrow: 'right',
    action: () => plot.setVisibility({ showData: true, showCurve: false }),
  },
  {
    label: 'Demo: a model',
    text: 'Now suppose we have a model — here a straight line — we think describes the data. ' +
          'Some points sit on it, some sit off. The question is: how well does it fit?',
    target: '#plot-wrap',
    arrow: 'right',
    action: () => plot.setVisibility({ showData: true, showCurve: true }),
  },
  {
    label: 'χ² formula',
    text:
      'We score the fit with <span class="math">χ² = Σᵢ (yᵢ − fᵢ)² / σᵢ²</span>, where ' +
      '<span class="math">yᵢ</span> is the measured value at the <em>i</em>-th data point, ' +
      '<span class="math">fᵢ</span> is the model prediction at that <span class="math">xᵢ</span>, ' +
      'and <span class="math">σᵢ</span> is the quoted error on <span class="math">yᵢ</span>. ' +
      'Each point contributes <span class="math">(yᵢ − fᵢ)² / σᵢ²</span> — points within ~1σ of ' +
      'the model contribute ~1, outliers contribute much more. ' +
      'Beside each point: the signed residual in <span class="math">σᵢ</span> units, ' +
      'and that value squared (its actual contribution to χ²). Colors encode the same: ' +
      'green is small, red is large.' +
      '<span class="tt-note">For independent Gaussian errors, χ² equals &minus;2 ln <em>L</em> ' +
      'up to an additive constant, so minimizing χ² is maximum-likelihood estimation.</span>',
    target: '#plot-wrap',
    arrow: 'right',
    action: () => {
      // Slider to true sigma so the top-right reads the data's true χ²
      sliderEl.value = String(tutorial.round.trueSigma);
      updateSliderDisplay();
      plot.setRevealed(true);
      plot.setChi2LabelsVisible(true);
    },
  },
  {
    label: 'χ²/dof',
    text: 'Dividing by dof gives <span class="math">χ²/dof</span>, which is ≈ 1 for a fit ' +
          'consistent with its quoted errors. Much greater than 1 → the model misses the data. ' +
          'Much less → errors are likely overestimated.',
    target: '#hud-tr',
    arrow: 'below',
  },
  {
    label: 'σ equivalent',
    text: 'Finally, the χ² maps to a sigma equivalent — how unlikely is a χ² this large under ' +
          'the null hypothesis that the model is correct? 0–1σ: consistent. 2–3σ: unclear. 4-5σ+: ' +
          'serious tension.',
    target: '#hud-tr',
    arrow: 'below',
  },
  {
    label: "You're ready",
    text: 'In each round you see a plot like this. Choose a σ for the tension, submit, see how close you ' +
          'were. Five rounds per game. Go hone your plot viewing skills!',
    target: null,
    final: true,
  },
];

const tutorial = {
  active: false,
  step: 0,
  round: null,
  backdrop: null,
  spotlight: null,
  tooltip: null,
};

function startTutorial(e) {
  if (e) e.preventDefault();
  if (tutorial.active) return;
  tutorial.active = true;
  tutorial.step = 0;

  // Hide menu, show game UI but inert (no submit/timer)
  menuEl.classList.add('hidden');
  topbarEl.classList.add('hidden');
  controlsEl.classList.remove('hidden');
  hudTlEl.classList.remove('hidden');
  hudTrEl.classList.remove('hidden');
  revealBannerEl.classList.add('hidden');
  summaryEl.classList.add('hidden');

  // Build the demo round
  const r = makeTutorialRound();
  tutorial.round = r;
  game.rounds = [r];
  game.roundIndex = 0;
  game.state = State.ROUND;
  plot.setRound(r, { rotate: false, sampledErrorbars: false });
  plot.setVisibility({ showData: true, showCurve: true });

  // Populate top-left HUD
  document.getElementById('hud-N').textContent = String(r.N);
  document.getElementById('hud-k').textContent = String(r.k);
  document.getElementById('hud-dof').textContent = String(r.dof);
  document.getElementById('hud-logy').classList.add('hidden');

  // Reset slider to ~1σ, hide submit
  sliderEl.value = '1.0';
  sliderEl.disabled = false;
  submitBtn.style.visibility = 'hidden';
  updateSliderDisplay();

  // Create overlay layers
  tutorial.backdrop = document.createElement('div');
  tutorial.backdrop.className = 'tutorial-backdrop';
  tutorial.spotlight = document.createElement('div');
  tutorial.spotlight.className = 'tutorial-spotlight';
  tutorial.tooltip = document.createElement('div');
  tutorial.tooltip.className = 'tutorial-tooltip';
  tutorial.quitBtn = document.createElement('button');
  tutorial.quitBtn.className = 'tutorial-quit';
  tutorial.quitBtn.type = 'button';
  tutorial.quitBtn.textContent = 'Quit tutorial';
  tutorial.quitBtn.addEventListener('click', endTutorial);
  document.body.appendChild(tutorial.backdrop);
  document.body.appendChild(tutorial.spotlight);
  document.body.appendChild(tutorial.tooltip);
  document.body.appendChild(tutorial.quitBtn);

  window.addEventListener('resize', repositionTutorial);
  showTutorialStep();
}

function showTutorialStep() {
  const s = TUTORIAL_STEPS[tutorial.step];
  if (!s) { endTutorial(); return; }

  if (s.action) s.action();

  // Locate target
  let targetRect = null;
  if (s.target) {
    const el = document.querySelector(s.target);
    if (el) targetRect = el.getBoundingClientRect();
  }

  // Position spotlight
  if (targetRect && targetRect.width > 0) {
    tutorial.spotlight.classList.remove('no-target');
    const pad = 6;
    Object.assign(tutorial.spotlight.style, {
      left:   `${targetRect.left - pad}px`,
      top:    `${targetRect.top - pad}px`,
      width:  `${targetRect.width + 2 * pad}px`,
      height: `${targetRect.height + 2 * pad}px`,
    });
  } else {
    tutorial.spotlight.classList.add('no-target');
    Object.assign(tutorial.spotlight.style, {
      left: '50%', top: '50%', width: '0', height: '0',
    });
  }

  // Tooltip content
  const isFinal = !!s.final;
  tutorial.tooltip.innerHTML = `
    <div class="tt-arrow"></div>
    <div class="tt-step">Step ${tutorial.step + 1} / ${TUTORIAL_STEPS.length} · ${s.label || ''}</div>
    <div class="tt-body">${s.text}</div>
    <div class="tt-actions">
      <button class="tt-skip" id="tt-skip">${isFinal ? 'Close' : 'Skip'}</button>
      <button class="primary tt-next" id="tt-next">${isFinal ? 'Finish' : 'Next'}</button>
    </div>
  `;
  document.getElementById('tt-next').addEventListener('click', tutorialNext);
  document.getElementById('tt-skip').addEventListener('click', endTutorial);

  positionTutorialTooltip(targetRect, s.arrow);
}

function repositionTutorial() {
  if (!tutorial.active) return;
  const s = TUTORIAL_STEPS[tutorial.step];
  if (!s) return;
  let targetRect = null;
  if (s.target) {
    const el = document.querySelector(s.target);
    if (el) targetRect = el.getBoundingClientRect();
  }
  if (targetRect && targetRect.width > 0) {
    const pad = 6;
    Object.assign(tutorial.spotlight.style, {
      left:   `${targetRect.left - pad}px`,
      top:    `${targetRect.top - pad}px`,
      width:  `${targetRect.width + 2 * pad}px`,
      height: `${targetRect.height + 2 * pad}px`,
    });
  }
  positionTutorialTooltip(targetRect, s.arrow);
}

function positionTutorialTooltip(targetRect, preferred) {
  const tt = tutorial.tooltip;
  tt.classList.remove('above', 'below', 'left', 'right');
  // Measure tooltip
  tt.style.visibility = 'hidden';
  tt.style.left = '0px';
  tt.style.top  = '0px';
  const ttRect = tt.getBoundingClientRect();
  const ttW = ttRect.width, ttH = ttRect.height;
  const margin = 22;

  let left, top, side = null;
  if (!targetRect || targetRect.width === 0) {
    left = (window.innerWidth - ttW) / 2;
    top  = (window.innerHeight - ttH) / 2;
  } else {
    const cx = targetRect.left + targetRect.width / 2;
    const cy = targetRect.top + targetRect.height / 2;
    const space = {
      below: window.innerHeight - targetRect.bottom,
      above: targetRect.top,
      right: window.innerWidth - targetRect.right,
      left:  targetRect.left,
    };
    const need = { below: ttH + margin, above: ttH + margin, right: ttW + margin, left: ttW + margin };
    const sides = ['below', 'above', 'right', 'left'];
    // Prefer the requested side only if it fits comfortably; otherwise
    // pick whichever side has the most space (even if that's still not enough,
    // we'll clamp below to keep the tooltip on screen — overlap is OK).
    let chosen = preferred && space[preferred] >= need[preferred]
      ? preferred
      : sides.slice().sort((a, b) => space[b] - space[a])[0];
    side = chosen;
    switch (chosen) {
      case 'below':
        top  = targetRect.bottom + margin;
        left = cx - ttW / 2;
        break;
      case 'above':
        top  = targetRect.top - ttH - margin;
        left = cx - ttW / 2;
        break;
      case 'right':
        left = targetRect.right + margin;
        top  = cy - ttH / 2;
        break;
      case 'left':
        left = targetRect.left - ttW - margin;
        top  = cy - ttH / 2;
        break;
    }
  }
  // Final clamp: never let the tooltip leave the viewport, even if it has to
  // overlap the target (which is fine — the spotlight outline still anchors it).
  const VP_MARGIN = 12;
  left = clamp(left, VP_MARGIN, window.innerWidth  - ttW - VP_MARGIN);
  top  = clamp(top,  VP_MARGIN, window.innerHeight - ttH - VP_MARGIN);

  tt.style.left = `${left}px`;
  tt.style.top  = `${top}px`;
  if (side) tt.classList.add(side);

  // Position the arrow notch to point at target center
  const arrow = tt.querySelector('.tt-arrow');
  if (arrow && targetRect && side) {
    const cx = targetRect.left + targetRect.width / 2;
    const cy = targetRect.top + targetRect.height / 2;
    if (side === 'below' || side === 'above') {
      const ax = clamp(cx - left, 14, ttW - 14);
      arrow.style.left = `${ax - 6}px`;
      arrow.style.top  = '';
    } else {
      const ay = clamp(cy - top, 14, ttH - 14);
      arrow.style.top  = `${ay - 6}px`;
      arrow.style.left = '';
    }
  } else if (arrow) {
    arrow.style.display = 'none';
  }
  tt.style.visibility = '';
}

function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

function tutorialNext() {
  tutorial.step++;
  if (tutorial.step >= TUTORIAL_STEPS.length) {
    endTutorial();
    return;
  }
  showTutorialStep();
}

function endTutorial() {
  if (!tutorial.active) return;
  tutorial.active = false;
  window.removeEventListener('resize', repositionTutorial);
  if (tutorial.backdrop)  tutorial.backdrop.remove();
  if (tutorial.spotlight) tutorial.spotlight.remove();
  if (tutorial.tooltip)   tutorial.tooltip.remove();
  if (tutorial.quitBtn)   tutorial.quitBtn.remove();
  tutorial.backdrop = tutorial.spotlight = tutorial.tooltip = tutorial.quitBtn = null;
  // Restore submit visibility and tear down demo state
  submitBtn.style.visibility = '';
  plot.stopAnimation();
  // The tutorial may have turned on χ² contribution labels; reset to the
  // user's saved preference (default off) so subsequent real games are clean.
  plot.setChi2LabelsVisible(getChi2LabelsPref());
  game.rounds = [];
  game.roundIndex = 0;
  showMenu();
  menuEl.innerHTML = menuMarkup();
  attachMenuHandlers();
}
