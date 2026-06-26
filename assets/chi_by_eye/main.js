// Chi By Eye - main entry & game state machine.

import { sigmaToChi2, chi2ToSigma, normCDF } from './stats.js';
import { DIFFICULTIES, makeRound } from './round.js';
import { Plot } from './plot.js';
import {
  makeSandbox, regenerateModel, setLogY, addPointAt,
  clearPoints, refreshYTrue, computeStats, asRound,
} from './sandbox.js';

// ---------- theme: keep in sync with the rest of the site ----------
(function () {
  const t = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', t);
})();

function applyThemeIcons(theme) {
  document.querySelectorAll('.icon-sun') .forEach(el => { el.style.display = theme === 'dark' ? 'block' : 'none'; });
  document.querySelectorAll('.icon-moon').forEach(el => { el.style.display = theme === 'dark' ? 'none'  : 'block'; });
}

function toggleTheme() {
  const cur  = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem('theme', next); } catch {}
  applyThemeIcons(next);
}

// Keyboard shortcut: press "d" to toggle dark/light (ignored while typing or with modifiers).
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key !== 'd' && e.key !== 'D') return;
  const el = document.activeElement, tag = el && el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el && el.isContentEditable)) return;
  toggleTheme();
});

// Reusable SVG markup for the sun/moon toggle button content.
const THEME_BTN_INNER = `
  <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
  <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>`;

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

// ============================================================
//  Leaderboard backend configuration
// ============================================================
//
// If REMOTE_LEADERBOARD_URL is null the game uses a purely local
// (per-device) leaderboard.  Fill in a Firebase Realtime Database URL to
// turn it into a SHARED leaderboard for all visitors.
//
// Setup (~5 minutes, free, no maintenance):
//   1. Go to https://console.firebase.google.com and sign in with a
//      Google account.
//   2. Click "Add project", name it (e.g. "chi-by-eye-leaderboard"),
//      skip Analytics.
//   3. Inside the project, choose Build → Realtime Database → Create
//      Database.  Pick the nearest region, then choose "Start in test
//      mode" (rules wide open for 30 days — fine for getting started).
//   4. Copy the Database URL from the top of the Data tab.  It looks
//      like: https://<your-project>-default-rtdb.firebaseio.com
//   5. Paste it into REMOTE_LEADERBOARD_URL below and refresh the game.
//
// To lock the rules down before the 30-day test window expires, paste
// these rules into the Rules tab:
//
  // {
  //   "rules": {
  //     "scores": {
  //       ".read": true,
  //       "$diff": {
  //         "$time": {
  //           "$entry": {
  //             ".write": "!data.exists() && newData.hasChildren(['id','name','animal','score'])",
  //             ".validate":
  //               "newData.child('score').isNumber()
  //             && newData.child('score').val() <= 100000
  //             && newData.child('name').isString()
  //             && newData.child('name').val().length <= 32"
  //           }
  //         }
  //       }
  //     }
  //   }
  // }
//
// These rules: anyone can READ; anyone can WRITE a NEW entry (no edits
// or deletes); score must be a number ≤ 100k; name capped at 32 chars.
//
// Why Firebase Realtime DB + REST (and not Firebase SDK / JSONBin /
// Supabase / etc.)?
//   - REST means no SDK to import (no extra ~100kB of JS).
//   - Realtime DB's POST endpoint auto-generates a child key per write,
//     so concurrent submissions can't overwrite each other.
//   - No API key in the client — auth-free reads/writes are governed
//     entirely by the security rules above.
//   - Generous free tier (1 GB stored, 10 GB downloaded / month).
const REMOTE_LEADERBOARD_URL = 'https://chibyeye-default-rtdb.firebaseio.com/'; // e.g. 'https://chi-by-eye-leaderboard-default-rtdb.firebaseio.com'

// ---------- leaderboard ----------
// localStorage-backed (always) plus optional remote shared leaderboard
// when REMOTE_LEADERBOARD_URL is set above. Reads merge local+remote and
// dedupe by entry.id. Writes go to localStorage immediately and POST to
// the remote in the background (the remote returns an auto-generated
// child key that we tag onto the local entry as _remoteKey so we can
// later PATCH the name).
//
// Local key format:
//   chiByEye.leaderboard.<difficulty>.<timeChoice>
// where timeChoice is 'unlimited' | '5' | '10' | '30'. Each entry has
// { id, name, animal, score, timestamp, difficulty, timeChoice,
//   _remoteKey? }.
const LB_PREFIX = 'chiByEye.leaderboard';
const LB_MAX_ENTRIES = 200; // cap per board to avoid unbounded growth
const ANIMALS = [
  'axolotl','narwhal','octopus','tardigrade','platypus','okapi','pangolin',
  'manatee','quokka','aardvark','wombat','dingo','gecko','capybara','meerkat',
  'flamingo','penguin','toucan','hedgehog','salamander','cuttlefish',
  'jellyfish','seahorse','iguana','chameleon','sloth','lemur','beaver',
  'otter','mongoose','badger','panther','ferret','tortoise','mongoose',
  'puffin','kiwi','wallaby','tapir','dugong','coelacanth','quoll','kakapo',
];
function randomAnimal() {
  return ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
}
function lbKey(difficulty, timeChoice) {
  return `${LB_PREFIX}.${difficulty}.${timeChoice}`;
}
function getLeaderboard(difficulty, timeChoice) {
  try {
    const raw = localStorage.getItem(lbKey(difficulty, timeChoice));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveLeaderboard(difficulty, timeChoice, board) {
  try {
    localStorage.setItem(lbKey(difficulty, timeChoice), JSON.stringify(board));
  } catch { /* quota etc. — ignore */ }
}
function addLeaderboardEntry(entry) {
  const board = getLeaderboard(entry.difficulty, entry.timeChoice);
  board.push(entry);
  board.sort((a, b) => b.score - a.score);
  if (board.length > LB_MAX_ENTRIES) board.length = LB_MAX_ENTRIES;
  saveLeaderboard(entry.difficulty, entry.timeChoice, board);
  // NOTE: we no longer auto-push to the remote here. The Firebase rules
  // suggested in the setup commentary are "write-once" (existing entries
  // can't be modified), so we wait until the player commits a name before
  // doing the single remote POST. See commitEntryToRemote() below.
  return board;
}
function updateLeaderboardEntryName(entry, newName) {
  const board = getLeaderboard(entry.difficulty, entry.timeChoice);
  const found = board.find(e => e.id === entry.id);
  if (found) {
    found.name = newName;
    saveLeaderboard(entry.difficulty, entry.timeChoice, board);
    // Keep entry object (caller may hold a reference) in sync too
    entry.name = newName;
    if (found._remoteKey) entry._remoteKey = found._remoteKey;
  }
  // If we've already pushed to remote, attempt a PATCH (will succeed only
  // if the user has loosened the write-once rule). Otherwise the commit
  // is deferred until commitEntryToRemote() runs.
  if (entry._remoteKey) patchRemoteEntryName(entry, newName);
}
// Push this entry to the remote leaderboard with whatever name it has now.
// Idempotent: if already pushed, becomes a no-op. If a push is currently in
// flight for the same entry id, we return that in-flight Promise instead of
// firing a second POST — prevents the "two entries per submission" bug when
// the user hits Enter and then clicks Play Again before the first POST has
// resolved.
const _entryPushPromises = new Map(); // entry.id -> Promise
async function commitEntryToRemote(entry) {
  if (!isRemoteEnabled()) return;
  if (entry._remoteKey) return;
  const existing = _entryPushPromises.get(entry.id);
  if (existing) return existing;
  const promise = pushRemoteEntry(entry).finally(() => {
    _entryPushPromises.delete(entry.id);
  });
  _entryPushPromises.set(entry.id, promise);
  return promise;
}
function leaderboardDisplayName(entry) {
  // === ARCADE NAMING (3-char ALL-CAPS) ===
  // For database entries with longer names (legacy from the previous
  // naming scheme), we just take the first 3 alphanumeric characters and
  // uppercase. If those map to a blocked arcade tag, OR the entry has no
  // name at all, we fall back to the arcade default "AAA" (matching the
  // input placeholder).
  let n = arcadeName(entry.name);
  if (n && isProfaneArcadeName(n)) n = '';
  if (n) return n;
  return 'AAA';
  // The entry.animal field is still generated for every new entry (see
  // randomAnimal() and the entry constructor below) so that we can switch
  // back to a per-entry differentiated fallback without changing the data
  // model. To re-enable the animal fallback, replace the `return 'AAA'`
  // line above with:
  //   const a = arcadeName(entry.animal);
  //   return a || 'AAA';
  // === OLD NAMING (longer names + "Anonymous <animal>" fallback). To
  // revert to the previous scheme, comment out the arcade block above
  // and uncomment the line below: ===
  // return (entry.name && entry.name.trim()) || `Anonymous ${entry.animal}`;
}

// ---------- remote leaderboard (Firebase Realtime DB via REST) ----------
// In-memory cache so reads are synchronous after a refresh; per (diff,time)
// key. Re-fetched whenever the player opens the leaderboard preview / view.
const _remoteCache = {};      // key -> Array<entry>
const _remoteInFlight = {};   // key -> Promise (so we don't double-fetch)
// If the player edits their name before the initial POST resolves (i.e.
// before _remoteKey is known), park the latest name update here and flush
// it once the POST returns. Otherwise the PATCH would no-op and the remote
// entry would stay with the empty (anonymous) name.
const _pendingNameUpdates = new Map(); // entry.id -> latest pending name
function _remoteKey(diff, timeChoice) { return `${diff}.${timeChoice}`; }
function _remoteEndpoint(diff, timeChoice) {
  return `${REMOTE_LEADERBOARD_URL}/scores/${encodeURIComponent(diff)}/${encodeURIComponent(timeChoice)}.json`;
}
function isRemoteEnabled() {
  return typeof REMOTE_LEADERBOARD_URL === 'string' && REMOTE_LEADERBOARD_URL.length > 0;
}

async function refreshRemoteBoard(diff, timeChoice, onUpdate) {
  if (!isRemoteEnabled()) return [];
  const key = _remoteKey(diff, timeChoice);
  if (_remoteInFlight[key]) return _remoteInFlight[key];
  _remoteInFlight[key] = (async () => {
    try {
      const res = await fetch(_remoteEndpoint(diff, timeChoice), { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const entries = data ? Object.values(data).filter(Boolean) : [];
      _remoteCache[key] = entries;
      if (typeof onUpdate === 'function') onUpdate(entries);
      return entries;
    } catch (e) {
      console.warn('[leaderboard] remote fetch failed:', e);
      return _remoteCache[key] || [];
    } finally {
      delete _remoteInFlight[key];
    }
  })();
  return _remoteInFlight[key];
}

async function pushRemoteEntry(entry) {
  if (!isRemoteEnabled()) return;
  try {
    const res = await fetch(_remoteEndpoint(entry.difficulty, entry.timeChoice), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const remoteKey = body && body.name;
    if (remoteKey) {
      // Tag both the in-memory and stored entry with the auto-generated
      // child key so we can PATCH the name later.
      entry._remoteKey = remoteKey;
      const board = getLeaderboard(entry.difficulty, entry.timeChoice);
      const stored = board.find(e => e.id === entry.id);
      if (stored) {
        stored._remoteKey = remoteKey;
        saveLeaderboard(entry.difficulty, entry.timeChoice, board);
      }
    }
    // Update cache so the entry shows in the preview immediately.
    const cacheKey = _remoteKey(entry.difficulty, entry.timeChoice);
    if (!_remoteCache[cacheKey]) _remoteCache[cacheKey] = [];
    _remoteCache[cacheKey].push(entry);
    // If the player typed a name before the POST resolved, flush that
    // queued update now that we know the entry's remote key.
    if (_pendingNameUpdates.has(entry.id)) {
      const pendingName = _pendingNameUpdates.get(entry.id);
      _pendingNameUpdates.delete(entry.id);
      // Avoid an unnecessary round-trip if the queued name matches what we
      // just POSTed.
      if (pendingName !== entry.name) {
        patchRemoteEntryName(entry, pendingName);
      }
    }
  } catch (e) {
    console.warn('[leaderboard] remote push failed:', e);
  }
}

async function patchRemoteEntryName(entry, newName) {
  if (!isRemoteEnabled()) return;
  if (!entry._remoteKey) {
    // POST hasn't resolved yet — queue this update and let pushRemoteEntry
    // flush it once _remoteKey is known. Latest write wins.
    _pendingNameUpdates.set(entry.id, newName);
    return;
  }
  try {
    await fetch(`${REMOTE_LEADERBOARD_URL}/scores/${encodeURIComponent(entry.difficulty)}/${encodeURIComponent(entry.timeChoice)}/${entry._remoteKey}.json`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    });
    // Update cache in place
    const cacheKey = _remoteKey(entry.difficulty, entry.timeChoice);
    const arr = _remoteCache[cacheKey];
    if (arr) {
      const cached = arr.find(e => e.id === entry.id);
      if (cached) cached.name = newName;
    }
  } catch (e) {
    console.warn('[leaderboard] remote patch failed:', e);
  }
}

// Returns local + remote-cache merged, deduped by entry.id, sorted desc.
// Synchronous: uses whatever's currently in the cache. Callers that want
// fresh data should kick off refreshRemoteBoard() and re-render on its
// callback.
function getMergedLeaderboard(diff, timeChoice) {
  const local = getLeaderboard(diff, timeChoice);
  const remote = _remoteCache[_remoteKey(diff, timeChoice)] || [];
  const byId = new Map();
  for (const e of remote) if (e && e.id) byId.set(e.id, e);
  for (const e of local)  if (e && e.id && !byId.has(e.id)) byId.set(e.id, e);
  const merged = Array.from(byId.values());
  merged.sort((a, b) => b.score - a.score);
  return merged;
}

// ---------- profanity filter ----------
// Base64-encoded comma-separated list, kept off the page source verbatim
// so the file isn't full of slurs in plain text. The decoded list is just
// what you'd expect — common English profanity and slurs. Extend the list
// in the helper script at the bottom of this comment if you want more.
//
//   to regenerate, run in Node:
//   Buffer.from(['word1','word2',...].join(',')).toString('base64')
// Coverage: common English profanity, sexual / explicit terms (avoiding
// substrings that trip on legitimate words — see commit-time notes), the
// most-used slurs (racial, ethnic, homophobic, transphobic, ableist), and
// taboo/extremist terms. ~53 entries. Substring-matched with leetspeak
// normalization, so "Sh1t", "f-u-c-k", and "shiiiit" all flag.
// ~94 entries: common English profanity + tense variants where the regex
// repeat-each-letter trick can't catch them, sexual / explicit terms,
// major slurs (racial, ethnic, homophobic, transphobic, ableist) including
// British and less common ones, and taboo/extremist terms. Substring-matched
// with leetspeak normalization, so "Sh1t", "f-u-c-k", "shiiit" all flag.
const PROFANITY_B64 =
  'c2hpdCxmdWNrLGZjayxjdW50LGRpY2ssY29jayxwdXNzeSxiaXRjaCxhc3Nob2xlLGJh' +
  'c3RhcmQsc2x1dCx3aG9yZSx0d2F0LHdhbmsscHJpY2ssbmlnZ2VyLG5pZ2dhLGZhZ2dv' +
  'dCxyZXRhcmQsc3BpYyxraWtlLGNoaW5rLGdvb2ssdHJhbm55LGR5a2Usd2V0YmFjayxu' +
  'YXppLGppaGFkLHJhcGlzdCxwZWRvLHBlZG9waGlsZSxwaXNzLGppenosdmFnaW5hLHBl' +
  'bmlzLGJsb3dqb2IsaGFuZGpvYixob29rZXIsZ2FuZ2JhbmcsbWFzdHVyYmF0LHRpdHMs' +
  'Ym9vYnMsZmFnLHBha2ksYmVhbmVyLHJhZ2hlYWQsdG93ZWxoZWFkLHNoZW1hbGUsaGl0' +
  'bGVyLGtrayxsb2xpY29uLGJlc3RpYWxpdHksdGVycm9yaXN0LHNleCxhbmFsLG1pbGYs' +
  'Y29vbixjdW0sYm9sbG9ja3MsYnVnZ2VyLGtub2Isa25vYmhlYWQsbWluZ2UsdG9zc2Vy' +
  'LHdhbmtlcixhcnNlLGFyc2Vob2xlLHNoYWcsYmludCxzbGFnLGNoYXYscGlrZXksbm9u' +
  'Y2UscHJhdCxwaWxsb2NrLHdvZyxneXBwbyxrYWZmaXIsZGFya2llLGppZ2Fib28scGlj' +
  'a2FuaW5ueSxob25reSxrcmF1dCxzcGF6LHNwYXN0aWMsbW9uZyxjcmlwcGxlLG1pZGdl' +
  'dCxwb29mLHBvb2Z0ZXIscGFuc3ksc2lzc3ksZmFpcnksdGl0dHksdGl0dGllcyxiZWxs' +
  'ZW5kLGZhbm55LHZhZyxtb2ZvLGZhcCxzZW1lbixzbWVnbWEsc3B1bmssZWphY3VsYXQs' +
  'cHJlY3VtLGNsaXQsbmlwcGxlLG5pcHBsZXMsYmFsbHNhY2ssbnV0c2FjayxqZXJrb2Zm' +
  'LGJ1a2tha2UsY3JlYW1waWUscmFwZSxyYXBpbixtb2xlc3QsaW5jZXN0LGdhbmdyYXBl' +
  'LHNudWZmLG5lY3JvcGhpbCx6b29waGlsLG9yZ3ksdGhyZWVzb21lLGZvdXJzb21lLGJk' +
  'c20sYm9uZGFnZSxodW1waW5nLGRvZ2d5c3R5bGUsaGVudGFpLGZ1dGEsZnV0YW5hcmks' +
  'YWhlZ2FvLHlpZmYsZWNjaGksc2NobG9uZyx3ZWluZXIscGVlbixwZWNrZXIsZG9uZyx3' +
  'aWxseSxjb29jaGllLHNuYXRjaCxiZWF2ZXIsanVncyxrbm9ja2Vycyxob290ZXJzLG1l' +
  'bG9ucyxnb25hZHMsbmFkcyxidXR0aG9sZSxzdWljaWQsc2VsZmhhcm0sa3lzLGttcyxr' +
  'aWxseW91cnNlbGYsZXJlY3QsZW5nb3JnLHJlY3R1bSxhbnVzLGN1Y2ssaGFyZCxjb21l' +
  'LGNvbWluZyxraWxs';
// Normalize: lowercase, leetspeak swap, strip non-letters. We deliberately
// don't collapse repeats here — the regex below allows each letter of a
// bad word to repeat one or more times, so "shiiit", "f-u-c-k", "$h1t",
// etc. all match. Trade-off: incidental substrings like "Dickens" or
// "scunthorpe" can still flag (the classic Scunthorpe problem); accept and
// let the user pick a different name.
function normalizeForProfanityCheck(s) {
  return String(s)
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/3/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/7/g, 't')
    .replace(/[^a-z]/g, '');
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
let _profanityRegex = null;
function getProfanityRegex() {
  if (_profanityRegex) return _profanityRegex;
  try {
    const list = atob(PROFANITY_B64).split(',').map(s => s.trim()).filter(Boolean);
    // For each word, allow each char to repeat (s+h+i+t+ matches both
    // "shit" and "shiiit") so we don't have to enumerate stretched forms.
    const patterns = list.map(w =>
      [...w].map(c => escapeRegex(c) + '+').join('')
    );
    _profanityRegex = new RegExp(patterns.join('|'));
  } catch {
    _profanityRegex = /^$/;
  }
  return _profanityRegex;
}
function isProfaneName(name) {
  if (!name || !name.trim()) return false;
  const norm = normalizeForProfanityCheck(name);
  if (!norm) return false;
  return getProfanityRegex().test(norm);
}

// ---------- arcade-name blocklist ----------
// Short (3-character) rude / lewd / slur terms that the main substring-
// matched profanity regex doesn't catch because the equivalent full word
// is what's listed there (e.g. "asshole" is in PROFANITY_B64, but "ASS"
// alone wouldn't match). Also covers letter-only emoticons like OWO/UWU
// that arrive intact through the alphanumeric-only input filter.
//
// Matched as EXACT-equality against the normalized 3-char form. Leetspeak
// (4→a, 5→s, 0→o, etc.) collapses before the check, so "@55", "4SS", etc.
// all map to "ass".
//
// Coverage:
//   * exact 3-char profanity / lewd stems (ass, cum, dik, tit, vag, …);
//   * letter-swap variants for the same stems so "k"/"c"/"q" alternates
//     of fuck / cock / cum / cunt / phuk all flag (kum, kok, kuk, coc,
//     phu, phk, fkn, fkr, mfk, knt, qnt, fuq, twa, jzz);
//   * slur stems and common abbreviations: nig + variants (nga, ngr, niq,
//     nyg), kik, kkk, jew, jap, wog, wop, pak, gyp, spz, spc, chk (chink),
//     gok (gook), coo (coon), dyk (dyke), abo (aboriginal slur), ret
//     (retard), crp (cripple), fgt (faggot), wnk, hor, bch;
//   * hostility abbreviations (gtf, stf, omf, bsh);
//   * letter-only emoticons that survive the alphanumeric filter
//     (owo, uwu, ovo, uvu, awa, xwx, xdd).
//
// To extend, regenerate the base64 with:
//   Buffer.from(['ass','fag','nig',...].join(',')).toString('base64')
// To revert: remove this constant and the helpers below, and the
// isProfaneArcadeName call sites fall back to isProfaneName alone.
const ARCADE_BLOCKLIST_B64 =
  'YXNzLGZhZyxuaWcsa2lrLGtrayxmdWssZnVjLGZjayxmdXgsZmNjLGN1bSxkaWss' +
  'aml6LHRpdCx2YWcsdHd0LHNsdSxwdXMsc2V4LGd5cCxqYXAsamV3LHdvZyx3b3As' +
  'cGFrLGhvcixiY2gsZ2F5LGFobyxzaHQsc2hpLHduayxzcHosc3BjLHlpZixiZG0s' +
  'eHh4LG93byx1d3Usb3ZvLHV2dSxhd2EseHd4LHRudCx4ZGQsa3VtLGtvayxrdWss' +
  'Y29jLHBodSxwaGssZmtuLGZrcixtZmssa250LHFudCxmdXEsdHdhLGp6eixuZ2Es' +
  'bmdyLG5pcSxueWcsY2hrLGdvayxjb28sZHlrLGFibyxyZXQsY3JwLGZndCxndGYs' +
  'c3RmLG9tZixic2g=';
let _arcadeBlocklist = null;
function getArcadeBlocklist() {
  if (_arcadeBlocklist) return _arcadeBlocklist;
  try {
    _arcadeBlocklist = new Set(
      atob(ARCADE_BLOCKLIST_B64).split(',').map(s => s.trim()).filter(Boolean)
    );
  } catch {
    _arcadeBlocklist = new Set();
  }
  return _arcadeBlocklist;
}
function isArcadeNameBlocked(name) {
  if (!name || !name.trim()) return false;
  const norm = normalizeForProfanityCheck(name);
  if (!norm) return false;
  return getArcadeBlocklist().has(norm);
}
// Combined check: catches both the long substring patterns (e.g. "FAG",
// "KKK") AND the short exact-match arcade blocklist above (e.g. "ASS",
// "OWO"). Used by the arcade-mode input validation.
function isProfaneArcadeName(name) {
  return isProfaneName(name) || isArcadeNameBlocked(name);
}

// ---------- arcade-name helpers ----------
// Normalize a raw user-supplied or legacy database name into the
// 3-character ALL-CAPS arcade form. Strips anything non-alphanumeric and
// truncates. Returns '' for empty / unusable input.
function arcadeName(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 3);
}
function makeEntryId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + '-' + Date.now().toString(36);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
function timeChoiceLabel(tc) {
  return tc === 'unlimited' ? 'Unlimited' : `${tc}s / round`;
}

// Crown awarded when score reaches ≥ 90% of the per-difficulty maximum.
const CROWN_THRESHOLD = 0.9;
function maxScoreForDifficulty(difficulty) {
  const mult = DIFFICULTIES[difficulty].scoreMultiplier;
  return BASE_SCORE_PER_ROUND * mult * ROUNDS_PER_GAME;
}
function crownSvg(size, ariaLabel = 'High score') {
  return `
    <svg class="crown" viewBox="0 0 24 24" width="${size}" height="${size}" aria-label="${ariaLabel}" role="img">
      <path d="M3 18 L3 8.5 L7.5 13 L12 5 L16.5 13 L21 8.5 L21 18 Z" fill="currentColor"/>
      <rect x="3" y="18" width="18" height="2.4" fill="currentColor"/>
      <circle cx="3"  cy="7"   r="1.2" fill="currentColor"/>
      <circle cx="12" cy="3.7" r="1.3" fill="currentColor"/>
      <circle cx="21" cy="7"   r="1.2" fill="currentColor"/>
    </svg>`;
}
function crownIfQualified(score, difficulty, size = 14) {
  if (score < CROWN_THRESHOLD * maxScoreForDifficulty(difficulty)) return '';
  const isMax = score >= maxScoreForDifficulty(difficulty);
  const cls = isMax ? 'crown crown-inline crown-max' : 'crown crown-inline';
  return crownSvg(size, 'High score').trim().replace(/class="crown"/, `class="${cls}"`);
}

// Render a 7-row leaderboard window centered on the player's entry. The
// player's row is highlighted and always sits in the visual middle of the
// box; if there aren't 3 scores above/below them, the empty slots render as
// blank rows so the centering stays consistent regardless of rank.
function renderLeaderboardPreview(entry) {
  const board = getMergedLeaderboard(entry.difficulty, entry.timeChoice);
  const userIdx = board.findIndex(e => e.id === entry.id);
  if (userIdx === -1) return '';

  const windowSize = 3;
  const slots = [];                                       // null = empty placeholder
  for (let off = -windowSize; off <= windowSize; off++) {
    const idx = userIdx + off;
    if (idx < 0 || idx >= board.length) slots.push(null);
    else slots.push({ entry: board[idx], rank: idx + 1 });
  }

  const rows = slots.map(slot => {
    if (slot === null) {
      return `<div class="lb-row lb-row-empty" aria-hidden="true"></div>`;
    }
    const e = slot.entry;
    const rank = slot.rank;
    const isUser = (e.id === entry.id);
    const name = leaderboardDisplayName(e);
    // === ARCADE NAMING input (3-char ALL-CAPS, alphanumeric only). ===
    // The input's value, placeholder, maxlength, and styling all enforce
    // the 3-char tag convention. To revert to the freeform 32-char input,
    // comment this branch out and uncomment the legacy branch below it.
    const inputHtml = isUser
      ? `<span class="lb-name-cell">
           <input class="lb-name-input lb-name-input-arcade" type="text"
                  maxlength="3"
                  size="3"
                  placeholder="AAA"
                  pattern="[A-Z0-9]{3}"
                  inputmode="text"
                  autocapitalize="characters"
                  autocomplete="off"
                  spellcheck="false"
                  value="${escapeHtml(arcadeName(entry.name))}"
                  aria-label="Enter your 3-character arcade tag">
           <span class="lb-save-status" aria-live="polite"></span>
         </span>`
      : `<span class="lb-name">${escapeHtml(name)}</span>`;
    /* === OLD NAMING input (freeform up to 32 chars). Uncomment to revert.
    const inputHtml = isUser
      ? `<span class="lb-name-cell">
           <input class="lb-name-input" type="text" maxlength="32"
                  placeholder="${escapeHtml(`Anonymous ${entry.animal}`)}"
                  value="${escapeHtml(entry.name || '')}"
                  aria-label="Edit your name">
           <span class="lb-save-status" aria-live="polite"></span>
         </span>`
      : `<span class="lb-name">${escapeHtml(name)}</span>`;
    */
    return `
      <div class="lb-row${isUser ? ' lb-row-user' : ''}">
        <span class="lb-rank">#${rank}</span>
        ${isUser ? `<span class="lb-you">You</span>` : ''}
        ${inputHtml}
        <span class="lb-score">${crownIfQualified(e.score, e.difficulty || entry.difficulty)}${Number(e.score).toLocaleString()}</span>
      </div>`;
  }).join('');

  return `
    <div class="leaderboard-preview">
      <div class="lb-header">
        <span class="lb-title">Leaderboard</span>
        <span class="lb-meta">${DIFFICULTIES[entry.difficulty].name} · ${timeChoiceLabel(entry.timeChoice)}</span>
        <a href="#" class="lb-open-full" id="lb-open-full">View all &rarr;</a>
      </div>
      <div class="lb-list">${rows}</div>
      <div class="lb-name-warning hidden" role="alert"></div>
      <div class="lb-foot">${isRemoteEnabled() ? 'shared leaderboard' : 'local to this device'} · ${board.length} score${board.length === 1 ? '' : 's'} total</div>
    </div>
  `;
}

// ---------- full leaderboard view ----------
// Shown when the player clicks "Leaderboards" from the menu (or "View all"
// from the summary preview). Lets them switch difficulty and time choice.
const LB_PAGE_SIZE = 20;
const lbView = {
  difficulty: 'challenging',
  timeChoice: 'unlimited',
  highlightEntryId: null,
  shown: LB_PAGE_SIZE,        // how many rows currently visible
};

function openLeaderboardView(opts = {}) {
  if (opts.difficulty)       lbView.difficulty       = opts.difficulty;
  if (opts.timeChoice)       lbView.timeChoice       = opts.timeChoice;
  lbView.highlightEntryId = opts.highlightEntryId || null;
  lbView.shown = LB_PAGE_SIZE; // reset pagination whenever the view opens

  menuEl.classList.add('hidden');
  summaryEl.classList.add('hidden');
  topbarEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  hudTlEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  document.getElementById('slider-truth').classList.add('hidden');
  game.state = 'leaderboard';

  renderLeaderboardView();
  leaderboardViewEl.classList.remove('hidden');
  // If remote is enabled, fetch the current filter's board in the background
  // and re-render when it returns.
  if (isRemoteEnabled()) {
    refreshRemoteBoard(lbView.difficulty, lbView.timeChoice, () => {
      if (game.state === 'leaderboard') renderLeaderboardView();
    });
  }
}
function closeLeaderboardView() {
  leaderboardViewEl.classList.add('hidden');
  showMenu();
  menuEl.innerHTML = menuMarkup();
  attachMenuHandlers();
}

// ---------- sandbox view ----------
// Free-form playground: no rounds, no scoring. User builds up a dataset,
// drags points / error bars, watches the χ² readouts respond. State lives
// in sandboxState (sandbox.js); rendering uses a dedicated Plot instance
// in interactive (drag-enabled) mode.
function openSandboxView() {
  menuEl.classList.add('hidden');
  summaryEl.classList.add('hidden');
  topbarEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  hudTlEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  document.getElementById('slider-truth').classList.add('hidden');
  if (leaderboardViewEl) leaderboardViewEl.classList.add('hidden');
  game.state = State.SANDBOX;

  if (!sandboxState) sandboxState = makeSandbox();
  // Make the view visible BEFORE constructing the Plot. The Plot
  // constructor reads the canvas's bounding rect to size its drawing
  // buffer; if the parent is still display:none that returns 0×0 and
  // the first render comes out collapsed.
  sandboxViewEl.classList.remove('hidden');
  // Build the view's DOM + plot on first open; reuse on subsequent opens.
  if (!sandboxPlot) {
    sandboxViewEl.innerHTML = sandboxViewMarkup();
    attachSandboxHandlers();
    const canvas = document.getElementById('sb-canvas');
    sandboxPlot = new Plot(canvas);
    sandboxPlot.setInteractive({
      onChange: (idx, kind) => {
        // Any kind that moves a point's x invalidates yTrue. groupMove
        // moves every selected point's x; 'point' moves one. err / cap
        // drags don't touch x, so yTrue stays correct.
        if (kind === 'point' || kind === 'groupMove') refreshYTrue(sandboxState);
        updateSandboxStats();
      },
      // On release, refit the y-axis range so a point dragged off-axis
      // becomes visible again — and so the axis doesn't keep jittering
      // mid-drag.
      onRelease: () => applySandboxToPlot(),
      // Click in empty plot space: if something is selected, deselect it;
      // otherwise drop a new point there with a random error bar.
      onClickEmpty: (wx, wy) => {
        if (sandboxSelection.length) {
          setSandboxSelection([]);
          return;
        }
        addPointAt(sandboxState, wx, wy);
        applySandboxToPlot();
      },
      // Drag in empty plot space draws a marquee; on release the indices
      // of points inside the rect become the new selection (replacing any
      // previous one). A zero-point release simply deselects.
      onBoxSelect: (indices) => {
        setSandboxSelection(indices || []);
      },
      // Fired by the plot when it has to clear the selection itself —
      // e.g. when the user drags an unselected point and the previous
      // selection should be dropped.
      onSelectionChange: (indices) => {
        sandboxSelection = [...indices];
        updateSandboxDeleteButton();
      },
    });
  }
  // Install the document-level keys BEFORE applySandboxToPlot so that
  // even if some downstream call throws, Esc / Delete / Backspace still
  // work. Guarded so repeated opens don't stack listeners.
  if (!sandboxKeyListener) {
    sandboxKeyListener = handleSandboxKeydown;
    document.addEventListener('keydown', sandboxKeyListener);
  }
  applySandboxToPlot();
}

function closeSandboxView() {
  // Pause any in-flight RAF (cloud sampling) — we'll restart it next open.
  if (sandboxPlot) sandboxPlot.stopAnimation();
  if (sandboxKeyListener) {
    document.removeEventListener('keydown', sandboxKeyListener);
    sandboxKeyListener = null;
  }
  sandboxViewEl.classList.add('hidden');
  showMenu();
  menuEl.innerHTML = menuMarkup();
  attachMenuHandlers();
}

function sandboxViewMarkup() {
  const s = sandboxState;
  return `
    <div class="sb-top">
      <h2>Sandbox</h2>
      <div class="view-header-actions">
        <button class="lbf-back" id="sb-back">&larr; Back to menu</button>
        <button class="dark-toggle" id="sb-theme-btn" title="Toggle dark mode (D)" aria-label="Toggle dark mode">${THEME_BTN_INNER}</button>
      </div>
    </div>
    <div class="sb-main">
      <div class="sb-plot-wrap">
        <canvas id="sb-canvas"></canvas>
        <div class="plot-hud plot-hud-tl sb-hud" id="sb-hud">
          <span class="hud-item"><span class="hud-k">N=</span><span class="hud-v" id="sb-hud-N">0</span></span>
        </div>
        <div class="sb-placeholder" id="sb-placeholder">click to add points</div>
      </div>
      <div class="sb-sidebar">
        <div class="sb-controls">
          <div class="sb-controls-row">
            <button class="sb-btn" id="sb-delete-selected" disabled>Delete selected</button>
            <button class="sb-btn" id="sb-clear">Clear all</button>
            <button class="sb-btn" id="sb-new-model">&#x21BB; New model</button>
          </div>
          <div class="sb-controls-row">
            <label class="sb-field">
              <span>Model parameters</span>
              <input type="number" id="sb-k" min="0" max="${Math.max(0, s.points.length - 1)}" value="${s.k}">
            </label>
            <span class="sb-dof-display">dof&thinsp;=&thinsp;<span id="sb-dof-val">${s.points.length === 0 ? '&mdash;' : s.points.length - s.k}</span></span>
          </div>
          <div class="sb-controls-row sb-toggles">
            <label class="sb-checkbox">
              <input type="checkbox" id="sb-chi2labels" ${s.showChi2Labels ? 'checked' : ''}>
              <span>show &chi;&sup2; contributions</span>
            </label>
          </div>
          <div class="sb-controls-row sb-toggles">
            <label class="sb-checkbox">
              <input type="checkbox" id="sb-logy" ${s.logY ? 'checked' : ''}>
              <span>log y</span>
            </label>
            <label class="sb-checkbox">
              <input type="checkbox" id="sb-bars" ${s.showBars ? 'checked' : ''}>
              <span>error bars</span>
            </label>
            <label class="sb-checkbox">
              <input type="checkbox" id="sb-clouds" ${s.showClouds ? 'checked' : ''}>
              <span>cloud samples</span>
            </label>
          </div>
        </div>
        <div class="sb-stats" aria-label="Live statistics for the current dataset">
          <div class="mini-stat readonly">
            <span class="ms-label">&chi;&sup2;</span>
            <div class="ms-bar-wrap"><div class="ms-bar"><div class="ms-fill" id="sb-fill-chi"></div></div></div>
            <span class="ms-value" id="sb-val-chi">&mdash;</span>
          </div>
          <div class="mini-stat readonly">
            <span class="ms-label">&chi;&sup2;/dof</span>
            <div class="ms-bar-wrap"><div class="ms-bar"><div class="ms-fill" id="sb-fill-red"></div></div></div>
            <span class="ms-value" id="sb-val-red">&mdash;</span>
          </div>
          <div class="mini-stat readonly with-ticks">
            <span class="ms-label"><em>p</em></span>
            <div class="ms-bar-wrap">
              <div class="ms-bar"><div class="ms-fill" id="sb-fill-p"></div></div>
              <div class="ms-ticks"><span>0</span><span>1</span></div>
            </div>
            <span class="ms-value" id="sb-val-p">&mdash;</span>
          </div>
          <div class="mini-stat readonly with-ticks">
            <span class="ms-label">&sigma;</span>
            <div class="ms-bar-wrap">
              <div class="ms-bar"><div class="ms-fill" id="sb-fill-sig"></div></div>
              <div class="ms-ticks"><span>0</span><span>&ge; ${SIGMA_SLIDER_MAX}</span></div>
            </div>
            <span class="ms-value" id="sb-val-sig">&mdash;</span>
          </div>
        </div>
        <details class="sb-intro">
          <summary>Controls</summary>
          <ul>
            <li>Click to add a point, or deselect the selection</li>
            <li>Drag on empty space to box-select</li>
            <li>Drag any selected point to move all selected</li>
            <li>Drag a selected error bar to resize all selected bars</li>
            <li>Delete key or backspace removes selected points</li>
            <li>Esc clears the selection</li>
          </ul>
        </details>
      </div>
    </div>
  `;
}

function attachSandboxHandlers() {
  document.getElementById('sb-back').addEventListener('click', closeSandboxView);
  document.getElementById('sb-theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('sb-delete-selected').addEventListener('click', deleteSandboxSelection);
  document.getElementById('sb-clear').addEventListener('click', () => {
    clearPoints(sandboxState);
    setSandboxSelection([]);
    applySandboxToPlot();
  });
  document.getElementById('sb-new-model').addEventListener('click', () => {
    regenerateModel(sandboxState);
    setSandboxSelection([]);
    applySandboxToPlot();
  });
  const kEl = document.getElementById('sb-k');
  kEl.addEventListener('input', (e) => {
    const N = sandboxState.points.length;
    const max = Math.max(0, N - 1);
    let v = parseInt(e.target.value, 10);
    if (!Number.isFinite(v) || v < 0) v = 0;
    v = Math.min(v, max);
    e.target.value = String(v);
    sandboxState.k = v;
    updateSandboxStats();
  });
  kEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.target.blur();
  });
  kEl.addEventListener('change', (e) => { e.target.blur(); });
  document.getElementById('sb-chi2labels').addEventListener('change', (e) => {
    sandboxState.showChi2Labels = e.target.checked;
    sandboxPlot.setChi2LabelsVisible(sandboxState.showChi2Labels);
  });
  document.getElementById('sb-logy').addEventListener('change', (e) => {
    setLogY(sandboxState, e.target.checked);
    applySandboxToPlot();
  });
  document.getElementById('sb-bars').addEventListener('change', (e) => {
    sandboxState.showBars = e.target.checked;
    sandboxPlot.setSandboxMode({ barsVisible: sandboxState.showBars });
  });
  document.getElementById('sb-clouds').addEventListener('change', (e) => {
    sandboxState.showClouds = e.target.checked;
    sandboxPlot.setSandboxMode({ cloudsVisible: sandboxState.showClouds });
  });
}

function syncSandboxInputs() {
  const kInput = document.getElementById('sb-k');
  if (kInput) kInput.value = String(sandboxState.k);
  const lg  = document.getElementById('sb-logy');
  if (lg)   lg.checked = sandboxState.logY;
  const br  = document.getElementById('sb-bars');
  if (br)   br.checked = sandboxState.showBars;
  const cl  = document.getElementById('sb-clouds');
  if (cl)   cl.checked = sandboxState.showClouds;
  const ch  = document.getElementById('sb-chi2labels');
  if (ch)   ch.checked = sandboxState.showChi2Labels;
}

// Push the current sandbox state to the plot. Called after any change that
// might alter the y-range or invalidate per-point state (add/remove point,
// new model, log-y toggle, drag release).
function applySandboxToPlot() {
  if (!sandboxPlot) return;
  const round = asRound(sandboxState);
  sandboxPlot.setRound(round, { rotate: false, sampledErrorbars: false });
  // Treat sandbox as "revealed" so the chi² contribution coloring kicks in
  // regardless of which toggles are active.
  sandboxPlot.setRevealed(true);
  sandboxPlot.setChi2LabelsVisible(sandboxState.showChi2Labels);
  sandboxPlot.setSandboxMode({
    barsVisible:   sandboxState.showBars,
    cloudsVisible: sandboxState.showClouds,
  });
  syncSandboxInputs();
  updateSandboxStats();
}

// Update the canonical selection state and push it into the plot, then
// refresh the Delete-button label / disabled state. This is the only
// way main.js mutates `sandboxSelection` — keeping a single funnel keeps
// the plot's rendered ring and the button UI in sync.
function setSandboxSelection(indices) {
  sandboxSelection = Array.isArray(indices) ? [...indices] : [];
  if (sandboxPlot) sandboxPlot.setSelection(sandboxSelection);
  updateSandboxDeleteButton();
}

function updateSandboxDeleteButton() {
  const btn = document.getElementById('sb-delete-selected');
  if (!btn) return;
  const n = sandboxSelection.length;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `Delete selected (${n})` : 'Delete selected';
}

function deleteSandboxSelection() {
  if (!sandboxSelection.length) return;
  // Iterate indices in descending order so each splice doesn't shift the
  // positions of later targets.
  const sorted = [...sandboxSelection].sort((a, b) => b - a);
  for (const i of sorted) sandboxState.points.splice(i, 1);
  setSandboxSelection([]);
  applySandboxToPlot();
}

// Document-level keydown handler — only active while the sandbox view is
// open. Ignores keystrokes when focus is on a form input so typing in
// the dof box doesn't trigger deletes. Uses both e.key and e.keyCode so
// it stays working on the few browsers that report legacy values.
function handleSandboxKeydown(e) {
  // Guard on the visible view rather than game.state so the handler is
  // robust even if game.state has been bumped to some transient value.
  if (!sandboxViewEl || sandboxViewEl.classList.contains('hidden')) return;
  const el   = document.activeElement;
  const tag  = (el && el.tagName)  || '';
  const type = (el && el.type)     || '';
  if ((tag === 'INPUT' && type !== 'checkbox') || tag === 'TEXTAREA' || tag === 'SELECT') return;
  const isDelete = e.key === 'Delete' || e.key === 'Backspace' ||
                   e.keyCode === 46     || e.keyCode === 8;
  const isEscape = e.key === 'Escape' || e.key === 'Esc' || e.keyCode === 27;
  if (isDelete) {
    if (sandboxSelection.length) {
      e.preventDefault();
      deleteSandboxSelection();
    }
  } else if (isEscape) {
    // Clear unconditionally — both the canonical mirror AND the plot's
    // own _selection — so even if the two have drifted, hitting Esc
    // always wipes any visible highlight ring.
    e.preventDefault();
    setSandboxSelection([]);
  }
}

function updateSandboxStats() {
  // Clamp k to < N whenever N has changed (e.g. after deleting points).
  const N = sandboxState.points.length;
  const kMax = Math.max(0, N - 1);
  if (sandboxState.k > kMax) sandboxState.k = kMax;
  const kInput = document.getElementById('sb-k');
  if (kInput) {
    kInput.max = String(kMax);
    kInput.value = String(sandboxState.k);
    kInput.disabled = N === 0;
  }

  const st = computeStats(sandboxState);

  // Update the dof readout beside the k control.
  const dofVal = document.getElementById('sb-dof-val');
  if (dofVal) dofVal.innerHTML = st.N === 0 ? '&mdash;' : String(st.dof);

  // N is shown in the plot's top-left HUD (matches the game-mode layout).
  const hudN = document.getElementById('sb-hud-N');
  if (hudN) hudN.textContent = String(st.N);
  // Placeholder ("click to add points") shows only while the plot is empty.
  const ph = document.getElementById('sb-placeholder');
  if (ph) ph.classList.toggle('hidden', st.N > 0);

  // Scale targets:
  //   χ²:        value at σ = SIGMA_SLIDER_MAX with the current dof
  //   χ²/dof:    that value / dof
  //   p:         0..1
  //   σ:         0..SIGMA_SLIDER_MAX (≥ max clamps the fill at 100%)
  const chi2Max    = sigmaToChi2(SIGMA_SLIDER_MAX, Math.max(1, st.dof));
  const redChi2Max = chi2Max / Math.max(1, st.dof);
  const setFill = (id, frac) => {
    const el = document.getElementById(id);
    if (el) el.style.width = (Math.max(0, Math.min(1, frac)) * 100).toFixed(1) + '%';
  };
  setFill('sb-fill-chi', chi2Max    > 0 ? st.chi2    / chi2Max    : 0);
  setFill('sb-fill-red', redChi2Max > 0 ? st.redChi2 / redChi2Max : 0);
  setFill('sb-fill-p',   st.pValue);
  setFill('sb-fill-sig', st.sigma / SIGMA_SLIDER_MAX);

  const fmt = (v) => (Math.abs(v) < 10 ? v.toFixed(2) : v.toFixed(1));
  const empty = st.N === 0;
  document.getElementById('sb-val-chi').innerHTML = empty ? '&mdash;' : fmt(st.chi2);
  document.getElementById('sb-val-red').innerHTML = empty ? '&mdash;' : fmt(st.redChi2);
  document.getElementById('sb-val-p').innerHTML   = empty ? '&mdash;'
    : (st.pValue < 0.001 ? '&lt; 0.001' : st.pValue.toFixed(3));
  document.getElementById('sb-val-sig').innerHTML = empty ? '&mdash;'
    : st.sigma.toFixed(2) + '&sigma;';
}

function renderLeaderboardView() {
  const diffEntries = Object.entries(DIFFICULTIES);
  const diffBtns = diffEntries.map(([key, d]) => {
    const sel = key === lbView.difficulty ? ' selected' : '';
    return `<button data-diff="${key}" class="${sel}">${d.name}</button>`;
  }).join('');

  const board = getMergedLeaderboard(lbView.difficulty, lbView.timeChoice);
  const maxPerRound = BASE_SCORE_PER_ROUND * DIFFICULTIES[lbView.difficulty].scoreMultiplier;
  const maxTotal = maxPerRound * ROUNDS_PER_GAME;

  // If the highlighted entry exists but lies beyond the current page,
  // expand the page so the player's own row is always visible without
  // needing to click "Show more".
  if (lbView.highlightEntryId) {
    const hi = board.findIndex(e => e.id === lbView.highlightEntryId);
    if (hi >= 0 && hi + 1 > lbView.shown) {
      const pages = Math.ceil((hi + 1) / LB_PAGE_SIZE);
      lbView.shown = pages * LB_PAGE_SIZE;
    }
  }
  const visible = board.slice(0, lbView.shown);
  const hiddenCount = Math.max(0, board.length - visible.length);

  const rowsHtml = board.length === 0
    ? `<div class="lb-empty">No scores yet for this difficulty / time. Play a game to be the first!</div>`
    : visible.map((e, i) => {
        const rank = i + 1;
        const isHighlight = e.id === lbView.highlightEntryId;
        const name = leaderboardDisplayName(e);
        const date = new Date(e.timestamp);
        const dateStr = date.toLocaleDateString(undefined,
          { year: 'numeric', month: 'short', day: 'numeric' });
        return `
          <div class="lbf-row${isHighlight ? ' lbf-row-highlight' : ''}">
            <span class="lbf-rank">#${rank}</span>
            <span class="lbf-name">${escapeHtml(name)}</span>
            <span class="lbf-score">${crownIfQualified(e.score, e.difficulty || lbView.difficulty)}${Number(e.score).toLocaleString()}<span class="lbf-denom"> / ${maxTotal.toLocaleString()}</span></span>
            <span class="lbf-date">${dateStr}</span>
          </div>`;
      }).join('');

  const showMoreHtml = hiddenCount > 0
    ? `<div class="lbf-show-more-wrap">
         <button class="lbf-show-more" id="lbf-show-more" type="button">
           Show more <span class="lbf-show-more-count">(${hiddenCount} more)</span>
         </button>
       </div>`
    : '';

  leaderboardViewEl.innerHTML = `
    <div class="lbf-top">
      <h2>Leaderboards</h2>
      <div class="view-header-actions">
        <button id="lbf-back" class="lbf-back">&larr; Back to menu</button>
        <button class="dark-toggle" id="lbf-theme-btn" title="Toggle dark mode (D)" aria-label="Toggle dark mode">${THEME_BTN_INNER}</button>
      </div>
    </div>
    <div class="lbf-filters">
      <div class="lbf-diff-row">${diffBtns}</div>
      <label class="lbf-time">
        <span>Time</span>
        <select id="lbf-time-choice">
          <option value="unlimited"${lbView.timeChoice === 'unlimited' ? ' selected' : ''}>Unlimited</option>
          <option value="30"${lbView.timeChoice === '30' ? ' selected' : ''}>30 seconds</option>
          <option value="10"${lbView.timeChoice === '10' ? ' selected' : ''}>10 seconds</option>
          <option value="5"${lbView.timeChoice === '5' ? ' selected' : ''}>5 seconds</option>
        </select>
      </label>
    </div>
    <div class="lbf-list-wrap">
      <div class="lbf-list-head">
        <span class="lbf-rank">rank</span>
        <span class="lbf-name">name</span>
        <span class="lbf-score">score</span>
        <span class="lbf-date">date</span>
      </div>
      <div class="lbf-list">${rowsHtml}</div>
      ${showMoreHtml}
    </div>
    <div class="lbf-foot">${isRemoteEnabled() ? 'Shared leaderboard. Scores from all players who have visited this page.' : 'Scores are stored locally on this device.'}</div>
  `;

  // Wire events
  leaderboardViewEl.querySelectorAll('.lbf-diff-row button').forEach(btn => {
    btn.addEventListener('click', () => {
      lbView.difficulty = btn.dataset.diff;
      lbView.shown = LB_PAGE_SIZE; // reset pagination on filter change
      renderLeaderboardView();
      requestAnimationFrame(scrollHighlightIntoView);
      if (isRemoteEnabled()) {
        refreshRemoteBoard(lbView.difficulty, lbView.timeChoice, () => {
          if (game.state === 'leaderboard') renderLeaderboardView();
        });
      }
    });
  });
  document.getElementById('lbf-time-choice').addEventListener('change', e => {
    lbView.timeChoice = e.target.value;
    lbView.shown = LB_PAGE_SIZE;
    renderLeaderboardView();
    requestAnimationFrame(scrollHighlightIntoView);
    if (isRemoteEnabled()) {
      refreshRemoteBoard(lbView.difficulty, lbView.timeChoice, () => {
        if (game.state === 'leaderboard') renderLeaderboardView();
      });
    }
  });
  document.getElementById('lbf-back').addEventListener('click', closeLeaderboardView);
  document.getElementById('lbf-theme-btn').addEventListener('click', toggleTheme);
  // Show more — bring in the next page of entries.
  const showMoreBtn = document.getElementById('lbf-show-more');
  if (showMoreBtn) {
    showMoreBtn.addEventListener('click', () => {
      lbView.shown += LB_PAGE_SIZE;
      renderLeaderboardView();
    });
  }

  scrollHighlightIntoView();
}

function scrollHighlightIntoView() {
  if (!leaderboardViewEl) return;
  const el = leaderboardViewEl.querySelector('.lbf-row-highlight');
  if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function wireLeaderboardPreviewHandlers(entry) {
  const input = summaryEl.querySelector('.lb-name-input');
  const warnEl = summaryEl.querySelector('.lb-name-warning');
  const statusEl = summaryEl.querySelector('.lb-save-status');
  if (input) {
    let lastAccepted = entry.name || '';

    // Status helpers — make "saved / unsaved / rejected" state explicit so
    // the player can see when their name is locked in.
    const setStatus = (kind, text) => {
      if (!statusEl) return;
      statusEl.className = `lb-save-status ${kind}`;
      statusEl.textContent = text;
    };
    const showPending  = () => setStatus('pending', 'Press Enter to save');
    const showSaved    = () => setStatus('saved',   '✓ saved');
    const showLocal    = () => setStatus('saved',   '✓ saved locally');
    // Initial state: if there's already a name and the entry is on the
    // remote, show saved; if no name yet, prompt them.
    if (entry._remoteKey) showSaved();
    else if (input.value) showPending();

    // Live update is delicate here: we don't want the entry.name (which is
    // what gets pushed to the leaderboard if the user navigates away) to
    // ever hold profanity. So while typing we only mirror clean values into
    // entry.name. Profane drafts stay in the input until the user fixes
    // them or navigates away (in which case the entry falls back to the
    // last clean name → anonymous animal).
    input.addEventListener('input', () => {
      // === ARCADE NAMING: enforce 3-char ALL-CAPS alphanumeric live as
      // the user types. Any disallowed character is dropped silently;
      // the rest auto-uppercase. ===
      const before = input.value;
      const cleaned = before.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3);
      if (cleaned !== before) {
        input.value = cleaned;
        // Place caret at end so consecutive keystrokes continue past the
        // last char rather than getting stuck mid-string.
        try { input.setSelectionRange(cleaned.length, cleaned.length); } catch (_) {}
      }
      // Reset feedback when the user resumes typing after a rejection.
      if (warnEl && !warnEl.classList.contains('hidden')) {
        warnEl.classList.add('hidden');
        input.classList.remove('lb-name-input-error');
      }
      const v = input.value;
      if (!isProfaneArcadeName(v)) {
        updateLeaderboardEntryName(entry, v);
      }
      if (!entry._remoteKey) showPending();
    });

    const commitOrReject = () => {
      const v = input.value;
      if (isProfaneArcadeName(v)) {
        if (warnEl) {
          warnEl.textContent = 'sorry, profanity checker flagged this one, please use another name';
          warnEl.classList.remove('hidden');
        }
        // Keep the typed text in the input so the player can see what was
        // rejected and edit it. Don't update entry.name (which stays at the
        // last clean value); don't push anything to the remote.
        input.classList.add('lb-name-input-error');
        setStatus('error', 'rejected — try a different name');
        setTimeout(() => { input.focus(); input.select(); }, 0);
        return;
      }
      lastAccepted = v;
      if (warnEl) warnEl.classList.add('hidden');
      input.classList.remove('lb-name-input-error');
      updateLeaderboardEntryName(entry, v);
      // First commit pushes to the remote — once that's done, the rules
      // we suggest in main.js make the entry write-once, so we lock the
      // input afterward.
      if (isRemoteEnabled() && !entry._remoteKey) {
        setStatus('saving', 'saving…');
        commitEntryToRemote(entry).then(() => {
          if (entry._remoteKey) {
            showSaved();
            input.readOnly = true;
            input.classList.add('lb-name-input-locked');
          } else {
            // Remote push failed; entry is still in localStorage.
            showLocal();
          }
        });
      } else if (!isRemoteEnabled()) {
        showLocal();
      } else {
        // Already saved to remote; if rules allow editing, patchRemoteEntryName
        // (called from updateLeaderboardEntryName) handles it. Either way,
        // local is up-to-date.
        showSaved();
      }
    };
    input.addEventListener('blur', commitOrReject);
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitOrReject();
        input.blur();
      }
    });
  }
  const openFull = summaryEl.querySelector('#lb-open-full');
  if (openFull) {
    openFull.addEventListener('click', (e) => {
      e.preventDefault();
      openLeaderboardView({
        difficulty: entry.difficulty,
        timeChoice: entry.timeChoice,
        highlightEntryId: entry.id,
      });
    });
  }
}

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
  SANDBOX: 'sandbox',
};

const game = {
  state: State.MENU,
  difficulty: 'challenging',
  timed: false,
  timeChoice: 'unlimited',   // 'unlimited' | '5' | '10' | '30'
  timerSeconds: 0,
  roundIndex: 0,             // 0..ROUNDS_PER_GAME-1
  rounds: [],                // current game's round data
  guesses: [],               // user sigma per round
  scores: [],                // score per round
  totalScore: 0,
  timerEndTime: 0,
  timerHandle: null,
  lastEntryId: null,         // leaderboard entry id for the current game
};

// ---------- DOM refs (assigned in init) ----------
let app, menuEl, topbarEl, stageEl, plotWrapEl, canvasEl, hudTlEl,
    controlsEl, sliderEl, sliderValEl, submitBtn, revealBannerEl,
    summaryEl, leaderboardViewEl, exitLinkEl, plot,
    sandboxViewEl;

// Sandbox-mode state. Created lazily on first sandbox open and reused
// across opens so the layout (points, dof, toggles) persists if the user
// pops back to the menu and returns.
let sandboxState = null;
let sandboxPlot  = null;
// Mirror of the plot's current selection (indices into sandboxState.points).
// Kept here so main.js can drive UI (Delete button enable/count) and
// handle Delete / Backspace / Escape keys without round-tripping the plot.
let sandboxSelection = [];
// Document-level keydown listener installed only while the sandbox view
// is open, so global keys don't hijack the game / leaderboard / menu.
let sandboxKeyListener = null;

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
    <div class="app-inner">
    <div class="topbar hidden" id="topbar">
      <div class="left">
        <button class="title" id="title-quit" type="button" title="Quit current game"><span style="font-family:'Times New Roman',serif;font-style:italic;">&chi;</span> by eye</button>
        <div class="meta">Round <b id="round-num">1</b> / ${ROUNDS_PER_GAME}</div>
        <div class="meta">Difficulty <b id="diff-name">—</b></div>
      </div>
      <div class="right">
        <div class="meta timer hidden" id="timer">Time <b id="timer-val">—</b></div>
        <div class="meta">Score <b id="score-val">0</b></div>
        <a class="exit" href="#" id="exit-link">Quit</a>
        <button class="dark-toggle" id="theme-toggle" title="Toggle dark mode (D)" aria-label="Toggle dark mode">
          <svg class="icon-sun" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
          </svg>
          <svg class="icon-moon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
          </svg>
        </button>
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
            <div class="pair secondary">
              <span class="k">True <em>p</em></span>
              <span class="v" id="rb-pvalue">—</span>
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
        <div class="mini-stats" aria-label="Stats derived from your tension slider">
          <div class="mini-stat">
            <span class="ms-label">&chi;&sup2;</span>
            <div class="ms-bar-wrap">
              <div class="ms-bar"><div class="ms-fill" id="ms-fill-chi"></div></div>
            </div>
            <span class="ms-value" id="ms-value-chi">—</span>
          </div>
          <div class="mini-stat">
            <span class="ms-label">&chi;&sup2;/dof</span>
            <div class="ms-bar-wrap">
              <div class="ms-bar"><div class="ms-fill" id="ms-fill-red"></div></div>
            </div>
            <span class="ms-value" id="ms-value-red">—</span>
          </div>
          <div class="mini-stat with-ticks">
            <span class="ms-label"><em>p</em></span>
            <div class="ms-bar-wrap">
              <div class="ms-bar"><div class="ms-fill" id="ms-fill-p"></div></div>
              <div class="ms-ticks"><span>0</span><span>1</span></div>
            </div>
            <span class="ms-value" id="ms-value-p">—</span>
          </div>
        </div>
        <button class="primary" id="submit-btn">Submit<span class="submit-sigma-label"> <span id="submit-sigma-val">1.00&sigma;</span></span></button>
      </div>

      <div class="menu" id="menu">
        ${menuMarkup()}
      </div>

      <div class="summary hidden" id="summary"></div>
      <div class="leaderboard-view hidden" id="leaderboard-view"></div>
      <div class="sandbox-view hidden" id="sandbox-view"></div>
    </div>
    </div>
  `;

  // Cache refs
  topbarEl = document.getElementById('topbar');
  menuEl = document.getElementById('menu');
  stageEl = document.getElementById('stage');
  plotWrapEl = document.getElementById('plot-wrap');
  canvasEl = document.getElementById('plot-canvas');
  hudTlEl = document.getElementById('hud-tl');
  controlsEl = document.getElementById('controls');
  sliderEl = document.getElementById('sigma-slider');
  sliderValEl = document.getElementById('sigma-val');
  submitBtn = document.getElementById('submit-btn');
  revealBannerEl = document.getElementById('reveal-banner');
  summaryEl = document.getElementById('summary');
  leaderboardViewEl = document.getElementById('leaderboard-view');
  sandboxViewEl = document.getElementById('sandbox-view');
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
  // Clicking the title in the topbar also quits to menu (with confirmation).
  document.getElementById('title-quit').addEventListener('click', confirmQuit);

  // Theme toggles — topbar (in-game) + menu overlay button (event-delegated so it
  // survives every menuEl.innerHTML re-render) + sandbox/leaderboard header buttons.
  applyThemeIcons(document.documentElement.getAttribute('data-theme') || 'dark');
  document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
  menuEl.addEventListener('click', e => { if (e.target.closest('.menu-theme-btn')) toggleTheme(); });
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
// Each tier lists its own full set of bullets (no "inherits from" shorthand).
// The bullets follow a consistent template: number of points → y-axis type →
// error-bar treatment → optional extras (rotation, clouds).
const DIFFICULTY_FEATURES = {
  easy: [
    '5–8 data points',
    'linear y axis',
    'uniform error bars',
  ],
  intermediate: [
    '7–12 data points',
    'linear y axis',
    'variable error bar sizes',
  ],
  challenging: [
    '8–12 data points',
    'linear / log y axis',
    'variable error bar sizes',
  ],
  hard: [
    '12–20 data points',
    'linear / log y axis',
    'variable error bar sizes',
    'rotating error bars',
  ],
  impossible: [
    '12–20 data points',
    'linear / log y axis',
    'variable error bar sizes',
    "bar visuals replaced by ongoing samples from each point's uncertainty",
  ],
};

function menuMarkup() {
  const diffEntries = Object.entries(DIFFICULTIES);
  const diffBtns = diffEntries.map(([key, d]) => {
    const features = DIFFICULTY_FEATURES[key] || [];
    const bullets = features.map(f => `<li>${f}</li>`).join('');
    return `<div class="diff-cell" data-diff="${key}">
       <button data-diff="${key}" class="${key === 'challenging' ? 'selected' : ''}">
         <span class="dname">${d.name}</span>
         <span class="dmult">&times;${d.scoreMultiplier.toFixed(1)} score</span>
       </button>
       <ul class="dfeatures">${bullets}</ul>
     </div>`;
  }).join('');
  return `
    <button class="dark-toggle menu-theme-btn" title="Toggle dark mode (D)" aria-label="Toggle dark mode">${THEME_BTN_INNER}</button>
    <h1><span class="chi">&chi;</span> by eye</h1>
    <p class="tagline">
      Estimate the tension between data and model. <br>New to &chi;&sup2;?
      <button type="button" class="tutorial-link" id="tutorial-link">Walk through the tutorial &rarr;</button>
    </p>
    <div class="diff-grid">${diffBtns}</div>
    <div class="option-row">
      <label class="time-choice-label">
        Time per round
        <select id="time-choice">
          <option value="unlimited" selected>Unlimited</option>
          <option value="30">30 seconds</option>
          <option value="10">10 seconds</option>
          <option value="5">5 seconds</option>
        </select>
      </label>
    </div>
    <div class="menu-buttons">
      <button class="primary start-btn" id="start-btn">Start game</button>
      <div class="menu-secondary">
        <button class="leaderboard-btn" id="open-leaderboard">
          <span class="msb-glyph" aria-hidden="true">&#x2605;</span>
          <span class="msb-label">Leaderboards</span>
        </button>
        <button class="sandbox-btn" id="open-sandbox">
          <span class="msb-glyph" aria-hidden="true">&#x25CE;</span>
          <span class="msb-label">Sandbox</span>
        </button>
      </div>
    </div>
    <div class="footer-note">
      Convention: two-sided &sigma; equivalent of the
      &chi;&sup2; upper-tail probability, common in astrophysics.
    </div>
  `;
}

function attachMenuHandlers() {
  // Difficulty buttons. Clicking a different difficulty selects it.
  // Clicking the already-selected one launches the game — which means
  // double-clicking any difficulty is a quick-start shortcut.
  menuEl.querySelectorAll('.diff-grid button').forEach(btn => {
    btn.addEventListener('click', () => {
      const wasSelected = btn.classList.contains('selected');
      menuEl.querySelectorAll('.diff-grid button').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      game.difficulty = btn.dataset.diff;
      if (wasSelected) {
        document.getElementById('start-btn').click();
      }
    });
  });
  // Time-per-round dropdown
  const timeSelect = document.getElementById('time-choice');
  if (game.timeChoice) timeSelect.value = game.timeChoice;
  document.getElementById('start-btn').addEventListener('click', () => {
    game.timeChoice = timeSelect.value; // "unlimited" | "5" | "10" | "30"
    if (game.timeChoice === 'unlimited') {
      game.timed = false;
      game.timerSeconds = 0;
    } else {
      game.timed = true;
      game.timerSeconds = parseInt(game.timeChoice, 10);
    }
    startGame();
  });
  // Tutorial link
  const tutLink = document.getElementById('tutorial-link');
  if (tutLink) tutLink.addEventListener('click', startTutorial);
  // Leaderboard link
  const lbBtn = document.getElementById('open-leaderboard');
  if (lbBtn) lbBtn.addEventListener('click', openLeaderboardView);
  // Sandbox link
  const sbBtn = document.getElementById('open-sandbox');
  if (sbBtn) sbBtn.addEventListener('click', openSandboxView);
}

// ---------- state transitions ----------
function showMenu() {
  game.state = State.MENU;
  // Reset to the default selection so the highlighted button on the menu
  // matches what Start uses, regardless of what was played last.
  game.difficulty = 'challenging';
  topbarEl.classList.add('hidden');
  controlsEl.classList.add('hidden');
  hudTlEl.classList.add('hidden');
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  document.getElementById('slider-truth').classList.add('hidden');
  summaryEl.classList.add('hidden');
  if (leaderboardViewEl) leaderboardViewEl.classList.add('hidden');
  if (sandboxViewEl)     sandboxViewEl.classList.add('hidden');
  menuEl.classList.remove('hidden');
}

function startGame() {
  game.roundIndex = 0;
  game.rounds = [];
  game.guesses = [];
  game.scores = [];
  game.totalScore = 0;
  const diffNameEl = document.getElementById('diff-name');
  diffNameEl.textContent = DIFFICULTIES[game.difficulty].name;
  diffNameEl.setAttribute('data-diff', game.difficulty);
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
  revealBannerEl.classList.add('hidden');

  const r = makeRound(game.difficulty);
  game.rounds.push(r);

  // Cache max χ² and reduced χ² (at the slider's max σ) for the mini-stat
  // sliders — recomputed once per round since dof changes.
  game._maxChi2 = sigmaToChi2(SIGMA_SLIDER_MAX, r.dof);
  game._maxRedChi2 = game._maxChi2 / r.dof;

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
  const submitSigmaValEl = document.getElementById('submit-sigma-val');
  if (submitSigmaValEl) submitSigmaValEl.innerHTML = sigmaText;
  const r = game.rounds[game.roundIndex];
  if (!r) return;
  const chi2 = sigmaToChi2(sigma, r.dof);
  const red = chi2 / r.dof;
  // χ² upper-tail p-value via the two-sided sigma relation (no extra
  // sigmaToChi2 lookup needed).
  const p = 2 * (1 - normCDF(sigma));
  // Cached per-round max values for the mini-slider scales.
  const maxChi2 = game._maxChi2 || sigmaToChi2(SIGMA_SLIDER_MAX, r.dof);
  const maxRed  = game._maxRedChi2 || (maxChi2 / r.dof);
  const fChi = (chi2 / maxChi2) * 100;
  const fRed = (red  / maxRed)  * 100;
  const fP   = p * 100;
  const clamp01 = v => Math.max(0, Math.min(100, v));
  document.getElementById('ms-fill-chi').style.width = `${clamp01(fChi)}%`;
  document.getElementById('ms-fill-red').style.width = `${clamp01(fRed)}%`;
  document.getElementById('ms-fill-p').style.width   = `${clamp01(fP)}%`;
  // When the slider is pinned at its max σ, the three derived quantities are
  // each pinned at one of their extremes — χ² and χ²/dof at their max for
  // this round, p at its minimum. Show "≥" or "≤" to signal "or beyond".
  const ge = atMax ? '≥' : '';
  const le = atMax ? '≤' : '';
  document.getElementById('ms-value-chi').textContent = ge + chi2.toFixed(2);
  document.getElementById('ms-value-red').textContent = ge + red.toFixed(2);
  const pStr =
    p >= 0.01  ? p.toFixed(3)
    : p > 0    ? p.toExponential(1)
                : '0';
  document.getElementById('ms-value-p').textContent = le + pStr;
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
  // p-value of the true chi² for this dof (= 2 · (1 − Φ(true σ))).
  const truePvalue = 2 * (1 - normCDF(Math.min(r.trueSigma, 37)));
  document.getElementById('rb-pvalue').textContent =
    truePvalue >= 0.01 ? truePvalue.toFixed(3)
    : truePvalue > 0    ? truePvalue.toExponential(1)
                         : '0';
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
  revealBannerEl.classList.add('hidden');
  document.getElementById('reveal-restore').classList.add('hidden');
  plot.stopAnimation();

  const maxPerRound = BASE_SCORE_PER_ROUND * DIFFICULTIES[game.difficulty].scoreMultiplier;
  const maxTotal = maxPerRound * ROUNDS_PER_GAME;
  const total = Math.round(game.totalScore);
  // Crown for ≥ 90% of the max — same threshold used inline next to
  // qualifying scores in the leaderboard preview / view.
  const earnedCrown = total >= CROWN_THRESHOLD * maxTotal;
  const isMaxScore = total >= maxTotal;
  const summaryCrownSvg = earnedCrown
    ? crownSvg(28).trim().replace(/class="crown"/, `class="crown${isMaxScore ? ' crown-max' : ''}"`)
    : '';

  function formatP(sig) {
    const pv = 2 * (1 - normCDF(Math.min(sig, 37)));
    if (pv >= 0.01)  return pv.toFixed(3);
    if (pv > 0)      return pv.toExponential(1);
    return '0';
  }
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
        <div class="row row-guess"><span class="k">your guess</span><span>${game.guesses[i].toFixed(2)}&sigma;</span></div>
        <div class="row row-truth"><span class="k">true</span><span>${r.trueSigma.toFixed(2)}&sigma;${r.trueSigma > SIGMA_SLIDER_MAX ? ' <span style="color:var(--muted);font-size:10px;">off-scale</span>' : ''}</span></div>
        <div class="row"><span class="k">&chi;&sup2;</span><span>${r.chi2.toFixed(2)}</span></div>
        <div class="row"><span class="k">&chi;&sup2;/dof</span><span>${r.redChi2.toFixed(2)}</span></div>
        <div class="row"><span class="k"><em>p</em></span><span>${formatP(r.trueSigma)}</span></div>
        <div class="mini-slider">
          <div class="track"></div>
          ${miniSliderMarker('user', game.guesses[i])}
          ${miniSliderMarker('truth', r.trueSigma)}
        </div>
        <div class="row score-row"><span>+${Math.round(game.scores[i])}</span><span class="k">of ${Math.round(maxPerRound)}</span></div>
      </div>
    `;
  }

  // Add this score to the leaderboard for the current (difficulty, timeChoice)
  // pair. We save immediately with a freshly-generated Anonymous-<animal>
  // name; the user can edit the name from the preview that follows.
  const newEntry = {
    id: makeEntryId(),
    name: '',
    animal: randomAnimal(),
    score: total,
    timestamp: Date.now(),
    difficulty: game.difficulty,
    timeChoice: game.timeChoice,
  };
  addLeaderboardEntry(newEntry);
  game.lastEntryId = newEntry.id;

  summaryEl.innerHTML = `
    <div class="top">
      <h2>Game complete · ${DIFFICULTIES[game.difficulty].name}</h2>
      <div class="total">${summaryCrownSvg}<span class="total-num">${total.toLocaleString()}</span><span class="denom"> / ${maxTotal.toLocaleString()}</span></div>
    </div>
    <div class="grid">${panels}</div>
    <div class="actions">
      <button class="primary" id="play-again">Play again</button>
      <button id="back-menu">Back to menu</button>
    </div>
    ${renderLeaderboardPreview(newEntry)}
  `;
  summaryEl.classList.remove('hidden');
  // Always start the player at the top of the summary
  summaryEl.scrollTop = 0;
  wireLeaderboardPreviewHandlers(newEntry);

  // Kick off a remote fetch in the background; when it returns, re-render
  // the preview so the player can see how they rank against everyone else.
  if (isRemoteEnabled()) {
    refreshRemoteBoard(newEntry.difficulty, newEntry.timeChoice, () => {
      // Only re-render if still on the summary screen for this entry
      if (game.state === State.SUMMARY && game.lastEntryId === newEntry.id) {
        const wrap = summaryEl.querySelector('.leaderboard-preview');
        if (wrap) {
          // Preserve the in-progress name being typed (if any) so a remote
          // re-render doesn't clobber the user's edit.
          const input = wrap.querySelector('.lb-name-input');
          const draftValue = input ? input.value : null;
          const focused = (document.activeElement === input);
          wrap.outerHTML = renderLeaderboardPreview(newEntry);
          wireLeaderboardPreviewHandlers(newEntry);
          if (draftValue !== null) {
            const newInput = summaryEl.querySelector('.lb-name-input');
            if (newInput) {
              newInput.value = draftValue;
              if (focused) newInput.focus();
            }
          }
        }
      }
    });
  }

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

  // If the player never committed a name (no remote push happened), make
  // sure we still get the score onto the global leaderboard before they
  // navigate away. Uses whatever name is currently in the entry (empty →
  // "Anonymous <animal>").
  function flushUnsavedEntry() {
    if (!game.lastEntryId || !isRemoteEnabled()) return;
    const board = getLeaderboard(game.difficulty, game.timeChoice);
    const entry = board.find(x => x.id === game.lastEntryId);
    if (!entry || entry._remoteKey) return;
    // Defensive: if the stored name somehow became profane (shouldn't happen
    // with the current input handler, but belt-and-braces), strip it before
    // pushing so the global leaderboard never sees profanity. Use the
    // arcade-aware check so short-form rude tags are also caught.
    if (isProfaneArcadeName(entry.name)) updateLeaderboardEntryName(entry, '');
    commitEntryToRemote(entry);
  }
  document.getElementById('play-again').addEventListener('click', () => {
    flushUnsavedEntry();
    startGame();
  });
  document.getElementById('back-menu').addEventListener('click', () => {
    flushUnsavedEntry();
    showMenu();
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
    text: 'Next to the slider, your <span class="math">σ</span> value is translated into ' +
          '<span class="math">χ²</span>, <span class="math">χ²/dof</span>, and the ' +
          "<span class=\"math\">p</span>-value. All four are equivalent forms of the same " +
          "number for this round's dof. Move the slider and they update together.",
    target: '.mini-stats',
    arrow: 'above',
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
    text: 'Now suppose we have a model that we think describes the data, here a straight line. ' +
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
      'Each point contributes <span class="math">(yᵢ − fᵢ)² / σᵢ²</span>. Points within ~1σ ' +
      'of the model contribute ~1; outliers contribute much more. ' +
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
    target: '.mini-stats',
    arrow: 'below',
  },
  {
    label: 'p-value and σ',
    text:
      'The <span class="math">χ²</span> first maps to a <em>p-value</em>: the ' +
      'chi-squared probability of seeing a <span class="math">χ²</span> at least this ' +
      'large by chance, if the model were correct. That maps in turn to a sigma equivalent. ' +
      'Rule of thumb: 0–1σ: consistent. 2–3σ: notable. 4–5σ+: serious tension.',
    target: '.mini-stats',
    arrow: 'above',
  },
  {
    label: 'dof matters',
    text:
      'Now suppose the model had <span class="math">k = 5</span> free parameters instead of 2, ' +
      'making <span class="math">dof = N − k = 1</span>. The data and curve are unchanged, ' +
      'so <span class="math">χ²</span> stays the same (≈ 6 here). But ' +
      '<span class="math">χ²/dof</span>, the <em>p</em>-value, and ' +
      '<span class="math">σ</span> all shift. Under the null hypothesis the expected ' +
      '<span class="math">χ²</span> equals <span class="math">dof</span>, so ' +
      '<span class="math">χ²</span>≈6 is just above the expected value at <span class="math">dof = 4</span> ' +
      '(p ≈ 0.17), but six times the expected value at <span class="math">dof = 1</span> ' +
      '(p ≈ 0.011). <span class="math">σ</span> nearly doubles.' +
      '<span class="tt-note">When you play, the round\'s k is shown in the top-left of the plot. ' +
      'Pay attention to it before reading off χ²/dof or σ.</span>',
    target: '#hud-tl',
    arrow: 'below',
    action: () => {
      // Reinterpret the same data with a parameter-heavy model so dof = 1.
      // χ² is unchanged because it depends only on data + curve.
      const r = tutorial.round;
      r.k = 5;
      r.dof = 1;
      r.trueSigma = chi2ToSigma(r.chi2, r.dof);
      r.redChi2 = r.chi2 / r.dof;
      document.getElementById('hud-k').textContent   = String(r.k);
      document.getElementById('hud-dof').textContent = String(r.dof);
      // Recompute mini-stat scale for the new dof and re-render the readout.
      game._maxChi2    = sigmaToChi2(SIGMA_SLIDER_MAX, r.dof);
      game._maxRedChi2 = game._maxChi2 / r.dof;
      sliderEl.value = String(Math.min(r.trueSigma, SIGMA_SLIDER_MAX));
      updateSliderDisplay();
    },
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
