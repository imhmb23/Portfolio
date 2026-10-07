/* ═══════════════════════════════════════════════════════════════════
   INTERACTIONS — cursor, card tilt, copy-to-clipboard, contact form
   ═══════════════════════════════════════════════════════════════════ */

/* ── Cursor ───────────────────────────────────────────────────────
   The ring lags the pointer by lerping toward it each frame; the dot
   sits at the true position. Everything is transform-only, so the
   whole thing stays on the compositor. */
export function initCursor({ reducedMotion = false } = {}) {
  const cursor = document.getElementById('cursor');
  if (!cursor) return;

  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!finePointer || reducedMotion) return;

  let tx = window.innerWidth / 2;
  let ty = window.innerHeight / 2;
  let x = tx;
  let y = ty;
  let visible = false;
  let raf = null;

  function loop() {
    raf = requestAnimationFrame(loop);
    x += (tx - x) * 0.16;
    y += (ty - y) * 0.16;
    cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }

  // The loop is started and stopped with visibility rather than left
  // running forever — an idle rAF keeps the compositor awake for no
  // reason on a page whose cursor is not even on screen.
  function start() {
    if (raf === null) raf = requestAnimationFrame(loop);
  }
  function halt() {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  window.addEventListener('pointermove', (e) => {
    tx = e.clientX;
    ty = e.clientY;
    if (!visible) {
      visible = true;
      cursor.classList.add('is-on');
      start();
    }
  }, { passive: true });

  // Bound to documentElement, not document: pointerleave does not
  // bubble, so a listener on `document` would never see the event.
  document.documentElement.addEventListener('pointerleave', () => {
    visible = false;
    cursor.classList.remove('is-on');
    halt();
  });

  // Grow over anything interactive.
  const INTERACTIVE = 'a, button, input, textarea, select, [data-tilt], .skill';
  document.addEventListener('pointerover', (e) => {
    if (e.target.closest && e.target.closest(INTERACTIVE)) cursor.classList.add('is-active');
  });
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest && e.target.closest(INTERACTIVE)) cursor.classList.remove('is-active');
  });

  return halt;
}

/* ── Card tilt ────────────────────────────────────────────────────
   Writes --rx / --ry, which the stylesheet composes into the card's
   single transform. One rect per pointerenter, cached for the duration
   of the hover — no layout reads in the hot path.

   The transform transition itself is declared in CSS (see the .card
   rule), not set here: an inline `transition` would overwrite the
   scroll-reveal transition on any card hovered before it revealed. */
export function initTilt({ reducedMotion = false } = {}) {
  const cards = document.querySelectorAll('[data-tilt]');
  if (!cards.length) return;

  const finePointer = window.matchMedia('(pointer: fine)').matches;
  if (!finePointer || reducedMotion) return;

  const MAX = 6;   // degrees — past ~8 this stops reading as physical

  cards.forEach((card) => {
    let rect = null;
    let raf = null;
    let px = 0;
    let py = 0;

    function apply() {
      raf = null;
      // Slightly wider on Y, since a card is wider than it is tall.
      card.style.setProperty('--rx', `${(-py * MAX).toFixed(3)}deg`);
      card.style.setProperty('--ry', `${(px * MAX * 1.35).toFixed(3)}deg`);
    }

    function onMove(e) {
      if (!rect) rect = card.getBoundingClientRect();
      px = (e.clientX - rect.left) / rect.width - 0.5;
      py = (e.clientY - rect.top) / rect.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    }

    function onEnter() {
      rect = card.getBoundingClientRect();
      card.addEventListener('pointermove', onMove, { passive: true });
    }

    function onLeave() {
      card.removeEventListener('pointermove', onMove);
      rect = null;
      if (raf) { cancelAnimationFrame(raf); raf = null; }
      card.style.removeProperty('will-change');
      card.style.setProperty('--rx', '0deg');
      card.style.setProperty('--ry', '0deg');
    }

    card.addEventListener('pointerenter', onEnter);
    card.addEventListener('pointerleave', onLeave);
  });
}

/* ── Copy email ───────────────────────────────────────────────────
   Clipboard API first, with a hidden-textarea fallback for browsers
   and non-secure origins that refuse it. */
export function initCopy() {
  const btn = document.getElementById('copyEmail');
  const hint = document.getElementById('copyHint');
  if (!btn || !hint) return;

  const email = btn.dataset.email || btn.textContent.trim();
  let resetTimer = null;

  function flash(ok) {
    btn.classList.toggle('is-copied', ok);
    hint.textContent = ok ? 'Copied' : 'Press ⌘C';
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      btn.classList.remove('is-copied');
      hint.textContent = 'Copy';
    }, 1900);
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  btn.addEventListener('click', async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(email);
        flash(true);
      } else {
        flash(legacyCopy(email));
      }
    } catch {
      flash(legacyCopy(email));
    }
  });
}

/* ── Contact form ─────────────────────────────────────────────────
   There is no backend, so a valid submission hands off to the visitor's
   mail client with everything pre-filled. See README for swapping in a
   form endpoint. */
export function initForm() {
  const form = document.getElementById('contactForm');
  const note = document.getElementById('formNote');
  const submit = document.getElementById('formSubmit');
  if (!form || !note) return;

  const TO = 'hello@kaivoss.dev';
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const rules = {
    'f-name':  (v) => (v.trim().length >= 2 ? '' : 'Please enter your name'),
    'f-email': (v) => (EMAIL_RE.test(v.trim()) ? '' : 'That email looks incomplete'),
    'f-msg':   (v) => (v.trim().length >= 12 ? '' : 'A little more detail, please'),
  };

  function setError(field, message) {
    const wrap = field.closest('.field');
    const err = wrap.querySelector('.field__err');
    wrap.classList.toggle('is-invalid', Boolean(message));
    if (err) err.textContent = message;
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
  }

  function validateField(field) {
    const rule = rules[field.id];
    if (!rule) return true;
    const message = rule(field.value);
    setError(field, message);
    return !message;
  }

  // Validate on blur, and clear the error as soon as the field is
  // corrected — validating on every keystroke is hostile.
  Object.keys(rules).forEach((id) => {
    const field = document.getElementById(id);
    if (!field) return;
    field.addEventListener('blur', () => validateField(field));
    field.addEventListener('input', () => {
      if (field.closest('.field').classList.contains('is-invalid')) {
        validateField(field);
      }
    });
  });

  function setNote(text, state) {
    note.textContent = text;
    note.classList.toggle('is-error', state === 'error');
    note.classList.toggle('is-ok', state === 'ok');
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const fields = Object.keys(rules)
      .map((id) => document.getElementById(id))
      .filter(Boolean);

    const invalid = fields.filter((f) => !validateField(f));
    if (invalid.length) {
      invalid[0].focus();
      setNote(`${invalid.length} field${invalid.length > 1 ? 's need' : ' needs'} attention`, 'error');
      return;
    }

    const data = new FormData(form);
    const body = [
      `Name: ${data.get('name') || '—'}`,
      `Email: ${data.get('email') || '—'}`,
      `Budget: ${data.get('budget') || 'Not specified'}`,
      '',
      `${data.get('message') || ''}`,
      '',
      '— sent from kaivoss.dev',
    ].join('\n');

    const href = `mailto:${TO}`
      + `?subject=${encodeURIComponent(`New project enquiry — ${data.get('name') || 'Website'}`)}`
      + `&body=${encodeURIComponent(body)}`;

    const original = submit.querySelector('span').textContent;
    submit.querySelector('span').textContent = 'Opening mail client…';
    submit.disabled = true;

    window.location.href = href;
    setNote('Your mail client should be opening now.', 'ok');

    setTimeout(() => {
      submit.querySelector('span').textContent = original;
      submit.disabled = false;
      setNote('Opens your mail client — no data leaves this page.', null);
    }, 3200);
  });
}

/* ── Footer year ──────────────────────────────────────────────────
   Set from the clock so it never goes stale in January. */
export function initYear() {
  const el = document.getElementById('year');
  if (el) el.textContent = String(new Date().getFullYear());
}
