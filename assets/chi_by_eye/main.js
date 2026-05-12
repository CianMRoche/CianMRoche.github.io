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
const SIGMA_SLIDER_MAX = 7;       // slider range 0 .. SIGMA_SLIDER_MAX
const SIGMA_SLIDER_STEP = 0.01;
const SIGMA_TICK_MARKS = [0, 1, 2, 3, 4, 5, 6, 7];
const BASE_SCORE_PER_ROUND = 1000;
// Scoring: full points if guess is within FULL_TOL sigma of truth; falls
// linearly to zero at MAX_ERR sigma.
const FULL_TOL = 0.15;
const MAX_ERR = 3.0;

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
let app, menuEl, topbarEl, stageEl, plotWrapEl, canvasEl, readoutEl,
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
        <div class="live-readout hidden" id="readout">
          <div class="lr-row"><span class="lr-key">&chi;&sup2;</span><span class="lr-val" id="readout-chi">—</span></div>
          <div class="lr-row"><span class="lr-key">&chi;&sup2;/dof</span><span class="lr-val" id="readout-red">—</span></div>
        </div>
        <div class="reveal-banner hidden" id="reveal-banner">
          <div class="pair">
            <span class="k">Your guess</span>
            <span class="v" id="rb-user">—</span>
          </div>
          <div class="pair">
            <span class="k">True</span>
            <span class="v" id="rb-true">—</span>
          </div>
          <div class="pair score">
            <span class="k">Score</span>
            <span class="v" id="rb-score">—</span>
          </div>
          <button class="primary next-btn" id="rb-next">Next</button>
        </div>
      </div>

      <div class="controls hidden" id="controls">
        <div class="label">&sigma; tension</div>
        <div class="slider-with-ticks">
          <input type="range" class="sigma" id="sigma-slider"
                 min="0" max="${SIGMA_SLIDER_MAX}" step="${SIGMA_SLIDER_STEP}" value="1">
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
  readoutEl = document.getElementById('readout');
  controlsEl = document.getElementById('controls');
  sliderEl = document.getElementById('sigma-slider');
  sliderValEl = document.getElementById('sigma-val');
  submitBtn = document.getElementById('submit-btn');
  revealBannerEl = document.getElementById('reveal-banner');
  summaryEl = document.getElementById('summary');
  exitLinkEl = document.getElementById('exit-link');

  // Slider tick labels
  const ticksEl = document.getElementById('slider-ticks');
  ticksEl.innerHTML = SIGMA_TICK_MARKS
    .map(v => `<span>${v}&sigma;</span>`).join('');

  plot = new Plot(canvasEl);

  // Event handlers
  sliderEl.addEventListener('input', onSliderInput);
  submitBtn.addEventListener('click', onSubmit);
  document.getElementById('rb-next').addEventListener('click', onNext);
  exitLinkEl.addEventListener('click', e => { e.preventDefault(); confirmQuit(); });

  // Keyboard: Enter to submit / advance
  document.addEventListener('keydown', onKeyDown);

  // Menu setup
  attachMenuHandlers();
}

function menuMarkup() {
  const diffEntries = Object.entries(DIFFICULTIES);
  const diffBtns = diffEntries.map(([key, d]) =>
    `<button data-diff="${key}" class="${key === 'intermediate' ? 'selected' : ''}">
       <span class="dname">${d.name}</span>
       <span class="dmult">×${d.scoreMultiplier.toFixed(1)}</span>
     </button>`).join('');
  return `
    <h1><span class="chi">&chi;</span> by eye</h1>
    <p class="tagline">
      Estimate how many &sigma; the data is in tension with the model. Five rounds,
      one slider, no second guesses. The live &chi;&sup2; and &chi;&sup2;/dof readout
      shows what your slider value corresponds to for that round's dof.
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
      Audience: astro / particle physics — uses two-sided &sigma; equivalent of the
      &chi;&sup2; upper-tail probability.
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
}

// ---------- state transitions ----------
function showMenu() {
  game.state = State.MENU;
  topbarEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  readoutEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
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
  document.getElementById('score-val').textContent = '0';
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
  readoutEl.classList.remove('hidden');
  revealBannerEl.classList.add('hidden');

  const r = makeRound(game.difficulty);
  game.rounds.push(r);

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

  // Timer
  if (game.timed) {
    game.timerEndTime = performance.now() + game.timerSeconds * 1000;
    tickTimer();
  }
}

function updateSliderDisplay() {
  const sigma = parseFloat(sliderEl.value);
  sliderValEl.innerHTML = `${sigma.toFixed(2)}&sigma;`;
  const r = game.rounds[game.roundIndex];
  if (!r) return;
  const chi2 = sigmaToChi2(sigma, r.dof);
  const red = chi2 / r.dof;
  document.getElementById('readout-chi').textContent = chi2.toFixed(2);
  document.getElementById('readout-red').textContent = red.toFixed(3);
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
  const score = computeScore(userSigma, effectiveTrue, DIFFICULTIES[game.difficulty].scoreMultiplier);
  game.scores.push(score);
  game.totalScore += score;
  document.getElementById('score-val').textContent = String(Math.round(game.totalScore));

  // Reveal mode on plot
  plot.setRevealed(true, userSigma);

  // Banner — show real trueSigma; flag it when it was off the slider.
  const trueLabel = r.trueSigma > SIGMA_SLIDER_MAX
    ? `${r.trueSigma.toFixed(2)}&sigma; <span style="font-size:11px;color:var(--muted);letter-spacing:0.04em;">(off-scale)</span>`
    : `${r.trueSigma.toFixed(2)}&sigma;`;
  document.getElementById('rb-user').innerHTML  = `${userSigma.toFixed(2)}&sigma;`;
  document.getElementById('rb-true').innerHTML  = trueLabel;
  document.getElementById('rb-score').textContent = String(Math.round(score));
  revealBannerEl.classList.remove('hidden');

  sliderEl.disabled = true;
  submitBtn.disabled = true;
  game.state = State.REVEAL;
}

function onNext() {
  if (game.state !== State.REVEAL) return;
  game.roundIndex++;
  if (game.roundIndex >= ROUNDS_PER_GAME) {
    showSummary();
  } else {
    beginRound();
  }
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
  readoutEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
  plot.stopAnimation();

  const maxPerRound = BASE_SCORE_PER_ROUND * DIFFICULTIES[game.difficulty].scoreMultiplier;
  const maxTotal = maxPerRound * ROUNDS_PER_GAME;
  const total = Math.round(game.totalScore);

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
      <div class="total">${total.toLocaleString()}<span class="denom"> / ${maxTotal.toLocaleString()}</span></div>
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
