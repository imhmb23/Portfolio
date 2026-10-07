/* ═══════════════════════════════════════════════════════════════════
   MAIN — boot sequence

   Order matters:
     1. Kick off the WebGL scene immediately so it compiles shaders
        while the preloader is still on screen.
     2. Run the counter. It is timer-driven, not load-driven, and is
        capped — a slow CDN delays the reveal but can never block it.
     3. Lift the curtain, start the scene intro, play the headline.
   A failsafe timer at the top guarantees the page is never left in a
   hidden state, whatever throws below.
   ═══════════════════════════════════════════════════════════════════ */

import { initHeroScene } from './three-scene.js';
import { initScroll } from './scroll.js';
import { initCursor, initTilt, initCopy, initForm, initYear } from './interactions.js';

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const MIN_RUN   = 1500;   // preloader always shows for at least this long
const MAX_RUN   = 3400;   // ...and never longer than this, come what may
const HOLD_AT   = 92;     // counter stalls here until `load` fires

/* ── Failsafe ─────────────────────────────────────────────────────
   If anything below throws, or a CDN never resolves, drop every
   hidden state and reveal the page. */
const failsafe = setTimeout(() => {
  console.warn('[boot] failsafe fired — revealing page.');
  forceReveal();
}, 4200);

function forceReveal() {
  document.documentElement.classList.add('force-reveal');
  document.documentElement.classList.remove('is-loading');

  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('is-done');
    setTimeout(() => preloader.classList.add('is-gone'), 1100);
  }
}

/* ── Preloader counter ────────────────────────────────────────────
   Drives to 100% on its own clock, holding at HOLD_AT until the load
   event lands. Resolves on whichever comes first: real completion or
   the hard cap. */
function runPreloader() {
  const preloader = document.getElementById('preloader');
  if (!preloader) return Promise.resolve();

  const countEl = document.getElementById('preloadCount');
  const barEl = document.getElementById('preloadBar');

  if (reducedMotion) {
    if (countEl) countEl.textContent = '100';
    if (barEl) barEl.style.width = '100%';
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let loaded = document.readyState === 'complete';
    const onLoad = () => { loaded = true; };
    window.addEventListener('load', onLoad, { once: true });

    const t0 = performance.now();

    function step(now) {
      const elapsed = now - t0;
      const ceil = loaded ? 100 : HOLD_AT;

      // Cubic ease-out so the counter sprints then settles.
      const t = Math.min(1, elapsed / MIN_RUN);
      const eased = 1 - Math.pow(1 - t, 3);
      const value = Math.min(eased * 100, ceil);

      const shown = Math.round(value);
      if (countEl) countEl.textContent = String(shown).padStart(2, '0');
      if (barEl) barEl.style.width = `${value}%`;

      if (elapsed >= MAX_RUN) {
        if (countEl) countEl.textContent = '100';
        if (barEl) barEl.style.width = '100%';
        window.removeEventListener('load', onLoad);
        resolve();
        return;
      }
      if (value >= 100 && elapsed >= MIN_RUN) {
        window.removeEventListener('load', onLoad);
        resolve();
        return;
      }
      requestAnimationFrame(step);
    }

    requestAnimationFrame(step);
  });
}

/* ── Boot ───────────────────────────────────────────────────────── */
async function boot() {
  const hero = document.querySelector('.hero');
  const canvas = document.getElementById('gl');

  /* The preloader and the 3D scene start together, not in sequence.
     Awaiting the scene first would leave the counter frozen at 00%
     for however long the Three.js CDN takes to respond. */
  const preload = runPreloader();

  const scenePromise = (canvas && hero)
    ? initHeroScene(canvas, { reducedMotion })
        .catch((err) => {
          console.warn('[boot] hero scene failed to initialise.', err);
          return null;
        })
    : Promise.resolve(null);

  const scroll = initScroll({ reducedMotion });
  initCursor({ reducedMotion });
  initTilt({ reducedMotion });
  initCopy();
  initForm();
  initYear();

  await preload;

  /* ── Lift the curtain ─────────────────────────────────────────── */
  clearTimeout(failsafe);

  const preloader = document.getElementById('preloader');
  document.documentElement.classList.remove('is-loading');

  if (preloader) {
    preloader.classList.add('is-done');
    // Remove from the tree once the wipe has finished, so it can never
    // intercept a pointer event or be reached by a tab press.
    preloader.addEventListener('transitionend', (e) => {
      if (e.propertyName === 'clip-path') preloader.classList.add('is-gone');
    }, { once: true });
    setTimeout(() => preloader.classList.add('is-gone'), 1600);
  }

  // The headline plays as the curtain clears, not before.
  setTimeout(() => {
    scroll.revealHero();
    scroll.initReveals();
    scroll.refresh();
  }, 130);

  /* The scene is never awaited on the critical path — if it is still
     compiling, the page is already interactive and it joins in late. */
  scenePromise.then((scene) => {
    if (scene) {
      scene.start();
    } else if (hero) {
      hero.classList.add('no-webgl');
    }
  });
}

/* ── Go ─────────────────────────────────────────────────────────── */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}

// Expose for debugging in the console. Not used by the page itself.
window.__portfolio = { forceReveal };
