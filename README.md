# Kai Voss — Portfolio

A dark, editorial 3D portfolio built as plain static files. No build step,
no `node_modules`, no bundler — push it to GitHub Pages and it runs.

---

## Contents

```
.
├── index.html          # all markup and content lives here
├── .nojekyll           # tells GitHub Pages to serve files verbatim
├── css/
│   ├── tokens.css      # colour, type, spacing, easing — start here
│   ├── base.css        # reset, typography, grain, cursor
│   ├── layout.css      # preloader, nav, drawer, footer
│   ├── sections.css    # hero, work, about, timeline, contact
│   └── motion.css      # reveal states, reduced-motion, print
├── js/
│   ├── main.js         # boot sequence + preloader
│   ├── three-scene.js  # WebGL hero
│   ├── scroll.js       # Lenis + reveals + nav state
│   └── interactions.js # cursor, card tilt, copy, form
└── assets/
    ├── mark.svg        # favicon
    ├── portrait.svg    # profile placeholder
    ├── og.svg          # social card source (export to PNG)
    └── work/*.svg      # six project images
```

---

## Run it locally

The page uses ES modules and fetches Three.js from a CDN, so `file://` will
not work — you need a local server.

```bash
# Python (no install needed)
python -m http.server 8000

# or Node
npx serve .
```

Then open <http://localhost:8000>.

In VS Code, the **Live Server** extension also works — right-click
`index.html` → *Open with Live Server*.

---

## Deploy to GitHub Pages

1. Create a repository and push this folder's contents to the root of the
   default branch.

   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

2. **Settings → Pages → Source: Deploy from a branch**, branch `main`,
   folder `/ (root)`. Save.

3. The site appears at `https://<you>.github.io/<repo>/` within a minute.

Everything is referenced with **relative paths** (`css/tokens.css`, not
`/css/tokens.css`), so it works from a project subpath as well as from a
user root site. Keep it that way if you add files.

### Custom domain

Add a file named `CNAME` at the root containing just your domain
(`kaivoss.dev`) and point a CNAME DNS record at `<you>.github.io`.

---

## Making it yours

### 1. The obvious placeholders

The site ships with dummy content. Search `index.html` and replace:

| What | Where |
|---|---|
| Name (`Kai Voss`) | `<title>`, meta tags, nav, hero, footer, preloader |
| Email (`hello@kaivoss.dev`) | contact section, `js/interactions.js` (`TO`) |
| Social URLs | contact section — all currently point at `https://github.com/` etc. |
| `assets/portrait.svg` | replace with a real photo (square, ~640×640) |
| `assets/work/*.svg` | replace with real project shots (16:10, ~1600×1000) |
| `assets/og.png` | export from `assets/og.svg` — see below |
| Timeline entries | the `<ol class="timeline__list">` block |
| Toolkit list | the `<ul class="stack__grid">` block |

There is no build step, so what you write in `index.html` is what ships.
Content is in the markup rather than injected by JavaScript on purpose —
it stays crawlable, and the page reads fine before the JS runs.

### 2. The accent colour

One colour drives the whole site. Change it in one place:

```css
/* css/tokens.css */
--acc:      #6D5BFF;   /* interactive states, section indices */
--acc-blue: #2F6BFF;   /* ambient light, gradient tail */
--acc-cyan: #46E3DC;   /* the single "signal" accent */
```

The 3D scene has its own copy of these, in `js/three-scene.js`:

```js
uColorA: { value: new THREE.Color(0x6D5BFF) },
uColorB: { value: new THREE.Color(0x46E3DC) },
uColorC: { value: new THREE.Color(0x2F6BFF) },
```

Keep the two in sync or the hero will drift away from the rest of the page.

### 3. The social card

Most platforms will **not** render an SVG `og:image`. Export
`assets/og.svg` to a PNG at 1200×630 before you launch:

```bash
rsvg-convert -w 1200 -h 630 assets/og.svg -o assets/og.png     # librsvg
inkscape assets/og.svg -w 1200 -h 630 -o assets/og.png          # Inkscape
```

The `og:image` and `twitter:image` tags in `index.html` already point at
`assets/og.png`; until you create that file the preview will simply be
blank rather than broken.

### 4. Wiring up the contact form

The form has no backend — on a valid submit it validates, then opens the
visitor's mail client with every field pre-filled. That keeps the site
deployable as pure static files.

To use a real endpoint instead, in `js/interactions.js` replace the
`window.location.href = href;` block inside the submit handler with a
`fetch` to your provider (Formspree, Basin, Netlify Forms, etc.):

```js
const res = await fetch('https://formspree.io/f/<your-id>', {
  method: 'POST',
  headers: { Accept: 'application/json' },
  body: new FormData(form),
});
setNote(res.ok ? 'Thanks — I’ll be in touch.' : 'Something went wrong.', res.ok ? 'ok' : 'error');
```

If you use Netlify Forms, add `netlify` and a `name` attribute to the
`<form>` tag instead and drop the `preventDefault` guard.

---

## How it is put together

### The 3D hero

`js/three-scene.js` builds a Fibonacci-distributed point sphere
(~3k–11k points depending on viewport) displaced in the vertex shader by
two octaves of 3D simplex noise, over a low-opacity geodesic wireframe
shell. It is bespoke rather than a loaded model, so it costs about 15 kB
of code instead of a few megabytes of geometry.

A few decisions worth knowing about if you edit it:

- **No `OrbitControls`.** Drag-to-rotate would mean the canvas has to
  accept pointer events, which means it can swallow a scroll or a tap on
  mobile. Parallax is bound to `window` with `pointer-events: none` on the
  canvas instead, so scrolling is never blocked.
- **Three.js is imported dynamically** inside a `try/catch`. If the CDN is
  blocked, `initHeroScene` returns `null`, `main.js` adds `.no-webgl` to
  the hero, and a CSS gradient stands in. The page never shows an empty
  box.
- **The render loop stops** when the hero scrolls out of view or the tab
  is backgrounded (`IntersectionObserver` + `visibilitychange`).
- Point count and device pixel ratio are both capped by viewport width.

### Motion

Smooth scrolling is [Lenis](https://github.com/darkroomengineering/lenis),
the maintained successor to Locomotive Scroll — Locomotive v4+ is itself a
Lenis wrapper, so this is the same mechanism without the legacy wrapper
transform issues.

GSAP is loaded but treated as **optional polish**, not a dependency. The
scroll reveals, progress bar, timeline spine and nav state are all
implemented natively, and the hero headline has a no-GSAP fallback. Block
the GSAP CDN and the site still works, just more plainly.

### Resilience

Two failure modes are handled explicitly:

- **JavaScript disabled** — every animated initial state is gated behind
  `html.js`, set by an inline script in `<head>`. Without JS the page
  renders fully, and the preloader is hidden outright.
- **JavaScript fails partway** — `main.js` arms a failsafe timer at boot
  that adds `html.force-reveal`, which drops every hidden state. The
  preloader counter is also timer-driven with a hard cap, so a slow CDN
  delays the reveal but can never block it.

### Accessibility

- Skip link, semantic landmarks, and a correct heading order.
- `prefers-reduced-motion` is honoured properly: reveals, parallax, card
  tilt, the grain animation and all looping decoration are disabled.
- Focus rings are visible and on-brand; the contact form validates on blur
  rather than on every keystroke, and errors are announced via
  `aria-invalid` plus a live region.
- The cursor effect and card tilt are disabled on coarse pointers.

---

## Browser support

Chrome/Edge 111+, Firefox 113+, Safari 16.4+. WebGL2 with a WebGL1
fallback via Three.js. `svh` units and `:has()`-free selectors throughout.

---

## Performance notes

If you need to trim further:

- Lower the counts in `pointCount()` in `js/three-scene.js`.
- Drop `uAmp` and `uNoiseScale` — the visual cost of noise is on the GPU,
  and two octaves is the sweet spot.
- The project images are SVG, so they are tiny and resolution-independent.
  If you swap in photographs, export at 1600×1000 and serve WebP/AVIF.
- Audit with Lighthouse — the only third-party requests are Google Fonts
  and the three CDN scripts.
