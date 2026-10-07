/* ═══════════════════════════════════════════════════════════════════
   SCROLL

   Smooth scrolling via Lenis (the maintained successor to Locomotive
   Scroll — Locomotive v4+ is itself a Lenis wrapper).

   Dependency policy: reveals, the progress bar, the timeline spine and
   the nav state are all implemented natively. GSAP is used only for
   the hero headline timeline, and is fully optional — if it fails to
   load, everything still animates, just more plainly.
   ═══════════════════════════════════════════════════════════════════ */

const NAV_OFFSET = -72;

export function initScroll({ reducedMotion = false } = {}) {
  const gsap = window.gsap;
  const ScrollTrigger = window.ScrollTrigger;
  const hasGsap = Boolean(gsap && ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ── Lenis ──────────────────────────────────────────────────────── */
  let lenis = null;
  if (!reducedMotion && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({
      duration: 1.05,
      // Long easing tail; short tails feel like a scroll-jack.
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      touchMultiplier: 1.7,   // native momentum on touch is better than ours
      wheelMultiplier: 1,
      autoResize: true,
    });

    if (hasGsap) {
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add((time) => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);
    } else {
      const loop = (time) => {
        lenis.raf(time);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }

  /* ── Anchor navigation ──────────────────────────────────────────
     Lenis does not intercept anchor clicks, so route them through it
     and offset by the fixed header height. */
  document.addEventListener('click', (e) => {
    // A click can land on the document itself (scrollbar gutter, etc.),
    // which has no .closest — guard before calling it.
    if (!(e.target instanceof Element)) return;

    const link = e.target.closest('a[href^="#"]');
    if (!link) return;

    const id = link.getAttribute('href');
    if (!id || id === '#') return;

    const target = document.querySelector(id);
    if (!target) return;

    e.preventDefault();
    closeDrawer();

    // The skip link has to move *focus*, not just scroll — it is the
    // keyboard user's way past the navigation. <main> is not focusable
    // by default, so give it a tabindex first.
    if (link.classList.contains('skip-link')) {
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }

    if (lenis) lenis.scrollTo(target, { offset: NAV_OFFSET, duration: 1.15 });
    else target.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
  });

  /* ── Hero headline ────────────────────────────────────────────────
     Each line rides up out of its overflow-hidden mask, staggered.
     `.hero__title .line__in` is pre-hidden in CSS so there is no flash
     of the final position before this runs. */
  function revealHero() {
    const lines = document.querySelectorAll('.hero__title .line__in');
    if (!lines.length) return;

    if (hasGsap && !reducedMotion) {
      // Normalise to GSAP's own percentage transform before animating,
      // rather than trusting the CSS starting value — computed styles
      // resolve percentages to a pixel matrix, which would make the
      // first frame of the tween jump.
      gsap.set(lines, { yPercent: 105, y: 0 });
      gsap.to(lines, {
        yPercent: 0,
        duration: 1.25,
        ease: 'expo.out',
        stagger: 0.085,
        delay: 0.1,
        onComplete: () => lines.forEach((l) => { l.style.willChange = 'auto'; }),
      });
    } else {
      lines.forEach((l) => { l.style.transform = 'none'; });
    }
  }

  /* ── Scroll reveals ───────────────────────────────────────────────
     IntersectionObserver rather than ScrollTrigger: simpler, cheaper,
     and it keeps working if GSAP is missing. */
  function initReveals() {
    const items = document.querySelectorAll('[data-reveal], .shead__title');
    if (!items.length) return;

    if (reducedMotion) {
      items.forEach((el) => el.classList.add('is-in'));
      return;
    }

    // Stagger siblings within the same block so groups cascade instead
    // of every element on the page animating on its own clock.
    const groups = new Map();
    items.forEach((el) => {
      const parent = el.closest('.wrap, .section, .about__grid, .work__grid, .contact__grid') || document.body;
      const list = groups.get(parent) || [];
      list.push(el);
      groups.set(parent, list);
    });
    groups.forEach((list) => {
      list.forEach((el, i) => {
        el.style.setProperty('--reveal-delay', `${Math.min(i, 6) * 70}ms`);
      });
    });

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        });
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
    items.forEach((el) => io.observe(el));
  }

  /* ── Progress bar ───────────────────────────────────────────────── */
  const progressBar = document.getElementById('progressBar');

  function updateProgress() {
    if (!progressBar) return;
    const doc = document.documentElement;
    const max = doc.scrollHeight - window.innerHeight;
    const p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
    progressBar.style.width = `${p * 100}%`;
  }

  /* ── Timeline spine ───────────────────────────────────────────────
     The gradient rule fills in proportion to how far the timeline has
     been scrolled through. */
  const spineFill = document.getElementById('spineFill');

  function updateSpine() {
    if (!spineFill) return;
    const rail = spineFill.parentElement;
    const rect = rail.getBoundingClientRect();
    const vh = window.innerHeight;

    // 0 when the rail's top reaches 80% of the viewport, 1 when its
    // bottom passes 30%. Gives the fill a readable head start and tail.
    const start = vh * 0.8;
    const end = vh * 0.3;
    const total = rect.height + (start - end);
    const travelled = start - rect.top;
    const p = Math.max(0, Math.min(1, travelled / (total || 1)));

    spineFill.style.transform = `scaleY(${p})`;
  }

  /* ── Nav state ──────────────────────────────────────────────────── */
  const nav = document.getElementById('nav');
  let lastY = window.scrollY;

  function updateNav() {
    if (!nav) return;
    const y = window.scrollY;

    nav.classList.toggle('is-stuck', y > 40);

    // Hide on scroll-down past the hero, reveal on any scroll-up.
    // Never hide while the preloader still has the page locked.
    const goingDown = y > lastY;
    const locked = document.documentElement.classList.contains('is-loading');
    if (y > 420 && goingDown && !locked) {
      nav.classList.add('is-hidden');
    } else {
      nav.classList.remove('is-hidden');
    }
    lastY = y;
  }

  /* ── Active section ─────────────────────────────────────────────── */
  const navLinks = Array.from(document.querySelectorAll('.nav__links a'));

  function initActiveSection() {
    if (!navLinks.length) return;

    const sections = navLinks
      .map((a) => document.querySelector(a.getAttribute('href')))
      .filter(Boolean);
    if (!sections.length) return;

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          navLinks.forEach((a) => {
            a.classList.toggle(
              'is-current',
              a.getAttribute('href') === `#${entry.target.id}`
            );
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px' }
    );
    sections.forEach((s) => io.observe(s));
  }

  initActiveSection();

  /* ── Mobile drawer ──────────────────────────────────────────────── */
  const drawer = document.getElementById('navDrawer');
  const toggle = document.getElementById('navToggle');

  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove('is-open');
    if (toggle) toggle.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    if (lenis) lenis.start();
    setTimeout(() => { drawer.hidden = true; }, 400);
  }

  if (toggle && drawer) {
    toggle.addEventListener('click', () => {
      const open = toggle.getAttribute('aria-expanded') === 'true';
      if (open) {
        closeDrawer();
      } else {
        drawer.hidden = false;
        // next frame, so the transition has a start state to run from
        requestAnimationFrame(() => drawer.classList.add('is-open'));
        toggle.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
        if (lenis) lenis.stop();
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeDrawer();
    });

    // Any resize past the breakpoint should not strand an open drawer.
    window.addEventListener('resize', debounce(() => {
      if (window.innerWidth > 940) closeDrawer();
    }, 150));
  }

  /* ── Back to top ────────────────────────────────────────────────── */
  const toTop = document.getElementById('toTop');
  if (toTop) {
    toTop.addEventListener('click', () => {
      if (lenis) lenis.scrollTo(0, { duration: 1.3 });
      else window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
    });
  }

  /* ── Single scroll listener ───────────────────────────────────────
     One rAF-throttled handler drives all three scroll-driven reads,
     rather than three independent listeners fighting for the frame. */
  let queued = false;
  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      updateProgress();
      updateSpine();
      updateNav();
      queued = false;
    });
  }

  if (!lenis) window.addEventListener('scroll', onScroll, { passive: true });
  else lenis.on('scroll', onScroll);

  window.addEventListener('resize', debounce(onScroll, 120));
  onScroll();

  function debounce(fn, ms) {
    let id;
    return (...args) => {
      clearTimeout(id);
      id = setTimeout(() => fn(...args), ms);
    };
  }

  return {
    get lenis() { return lenis; },
    initReveals,
    revealHero,
    refresh() {
      // Called once the preloader releases its overflow lock, so Lenis
      // re-measures a document that is finally free to scroll.
      if (lenis) lenis.resize();
      if (hasGsap) ScrollTrigger.refresh();
    },
    destroy() {
      if (lenis) lenis.destroy();
      if (hasGsap) ScrollTrigger.getAll().forEach((t) => t.kill());
    },
  };
}
