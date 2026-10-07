/* ═══════════════════════════════════════════════════════════════════
   HERO SCENE

   A GPU-displaced point sphere plus a geodesic wireframe shell.

   Deliberate choices:
   · Three.js is imported dynamically and wrapped in try/catch, so a
     blocked CDN degrades to the CSS fallback instead of an empty hero.
   · The canvas is pointer-events:none. Pointer parallax is bound to
     `window`, so the WebGL layer can never swallow a scroll or tap —
     this is why there is no OrbitControls here.
   · Point count and device pixel ratio scale with viewport, and the
     render loop halts whenever the hero leaves the viewport or the
     tab is backgrounded.
   ═══════════════════════════════════════════════════════════════════ */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

/* Ashima / Stefan Gustavson 3D simplex noise — the standard public-domain
   implementation, inlined to avoid a second network request. */
const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);

  vec3 g  = step(x0.yzx, x0.xyz);
  vec3 l  = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  i = mod289(i);
  vec4 p = permute(permute(permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));

  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);

  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);

  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;

  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`;

const VERT = /* glsl */`
${NOISE_GLSL}

uniform float uTime;
uniform float uSize;
uniform float uDpr;
uniform float uRadius;
uniform float uNoiseScale;
uniform float uAmp;
uniform float uIntro;      // 0 = scattered, 1 = settled
uniform vec2  uPointer;    // damped, -1..1

attribute float aScale;
attribute float aRand;

varying float vDisp;
varying float vRand;
varying float vFade;

void main() {
  vec3 dir = normalize(position);

  // Two octaves: a slow large-scale swell and a faster fine ripple.
  float n1 = snoise(dir * uNoiseScale + vec3(0.0, uTime * 0.13, uTime * 0.09));
  float n2 = snoise(dir * uNoiseScale * 2.4 - vec3(uTime * 0.07));
  float disp = n1 * 0.26 + n2 * 0.085;

  // Pointer nudges the field gently toward the cursor, never snaps.
  disp += (uPointer.x * dir.x + uPointer.y * dir.y) * 0.055;

  float radius = uRadius + disp * uAmp;

  // Intro: points start far out and converge. Eased, with a per-point
  // offset (aRand) so they don't all land on the same frame.
  float intro = clamp((uIntro - aRand * 0.32) / 0.68, 0.0, 1.0);
  intro = 1.0 - pow(1.0 - intro, 3.0);

  radius = mix(uRadius * 4.2, radius, intro);

  vec3 p = dir * radius;

  // Slow swirl around Y so the sculpture never reads as static.
  float a = uTime * 0.055;
  p.xz = mat2(cos(a), -sin(a), sin(a), cos(a)) * p.xz;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  float size = uSize * aScale * uDpr * (1.0 / max(-mv.z, 0.1));
  gl_PointSize = size * mix(0.15, 1.0, intro);

  // Points behind the core dim down, which reads as depth.
  vFade  = smoothstep(-2.4, 2.4, p.z) * 0.55 + 0.45;
  vDisp  = disp;
  vRand  = aRand;
}
`;

const FRAG = /* glsl */`
precision highp float;

uniform vec3  uColorA;   // indigo
uniform vec3  uColorB;   // cyan
uniform vec3  uColorC;   // blue
uniform float uOpacity;

varying float vDisp;
varying float vRand;
varying float vFade;

void main() {
  // Soft round sprite. Hard-edged square points are the tell of a
  // tutorial scene; this reads as light rather than geometry.
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  float alpha = smoothstep(0.5, 0.06, d);
  if (alpha < 0.01) discard;

  // Ridge line: points near displacement 0 are the brightest, so the
  // sphere shows a faint banded structure instead of a uniform mush.
  float ridge = 1.0 - smoothstep(0.0, 0.14, abs(vDisp));

  vec3 color = mix(uColorA, uColorC, smoothstep(-0.3, 0.3, vDisp));
  color = mix(color, uColorB, ridge * 0.65);

  alpha *= uOpacity * vFade * (0.35 + vRand * 0.65);

  gl_FragColor = vec4(color, alpha);
}
`;

function pointCount() {
  const w = window.innerWidth;
  if (w < 700) return 3000;
  if (w < 1200) return 6500;
  return 11000;
}

function targetDpr() {
  return Math.min(window.devicePixelRatio || 1, window.innerWidth < 900 ? 1.5 : 2);
}

/**
 * Boot the hero scene.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{destroy: () => void} | null>} null if WebGL/Three unavailable
 */
export async function initHeroScene(canvas, { reducedMotion = false } = {}) {
  let THREE;
  try {
    THREE = await import(THREE_URL);
  } catch (err) {
    console.warn('[hero] Three.js failed to load — using CSS fallback.', err);
    return null;
  }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,           // lets the CSS radial glow read through
      antialias: false,      // points don't benefit; costs real frames
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
  } catch (err) {
    console.warn('[hero] WebGL unavailable — using CSS fallback.', err);
    return null;
  }

  let dpr = targetDpr();
  renderer.setPixelRatio(dpr);
  renderer.setClearAlpha(0);

  const scene = new THREE.Scene();

  // Aspect-aware framing: on wide screens the sculpture sits right of
  // the headline; on narrow screens it centres behind the copy.
  const camera = new THREE.PerspectiveCamera(52, 1, 0.1, 100);
  camera.position.set(0, 0, 6.2);

  const group = new THREE.Group();
  scene.add(group);

  /* ── Point sphere ─────────────────────────────────────────────── */
  const count = pointCount();
  const geometry = new THREE.BufferGeometry();

  const positions = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const rands = new Float32Array(count);

  // Fibonacci sphere: even coverage with no pole clustering.
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = golden * i;

    positions[i * 3]     = Math.cos(theta) * r;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = Math.sin(theta) * r;

    scales[i] = 0.45 + Math.random() * 0.95;
    rands[i]  = Math.random();
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
  geometry.setAttribute('aRand', new THREE.BufferAttribute(rands, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

  const uniforms = {
    uTime:       { value: 0 },
    uSize:       { value: 24 },
    uDpr:        { value: dpr },
    uRadius:     { value: 2.05 },
    uNoiseScale: { value: 1.35 },
    uAmp:        { value: 0.42 },
    uIntro:      { value: 0 },
    uPointer:    { value: new THREE.Vector2(0, 0) },
    uColorA:     { value: new THREE.Color(0x6D5BFF) },
    uColorB:     { value: new THREE.Color(0x46E3DC) },
    uColorC:     { value: new THREE.Color(0x2F6BFF) },
    uOpacity:    { value: 0.62 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,                        // additive: depth would occlude
    blending: THREE.AdditiveBlending,
  });

  const points = new THREE.Points(geometry, material);
  group.add(points);

  /* ── Geodesic shell ───────────────────────────────────────────────
     Very low opacity. Its job is to hint at an underlying structure,
     not to be read as a shape. */
  const shellGeo = new THREE.WireframeGeometry(new THREE.IcosahedronGeometry(3.15, 1));
  const shell = new THREE.LineSegments(
    shellGeo,
    new THREE.LineBasicMaterial({
      color: 0x8E82FF,
      transparent: true,
      opacity: 0.05,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  group.add(shell);

  /* ── Pointer parallax ───────────────────────────────────────────── */
  const pointer = { x: 0, y: 0 };       // raw, -1..1
  const damped = { x: 0, y: 0 };        // eased toward raw each frame
  let pointerBound = false;

  function onPointerMove(e) {
    pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  }

  if (!reducedMotion && window.matchMedia('(pointer: fine)').matches) {
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    pointerBound = true;
  }

  /* ── Resize ─────────────────────────────────────────────────────── */
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (w === 0 || h === 0) return;

    dpr = targetDpr();
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    uniforms.uDpr.value = dpr;

    const aspect = w / h;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    const wide = aspect > 1.05;
    group.position.x = wide ? aspect * 1.35 : 0;
    group.position.y = wide ? 0.12 : 0.55;
    const s = wide ? 1 : Math.min(0.82, aspect * 0.95);
    group.scale.setScalar(s);

    // Smaller sprites on dense small screens, or the field turns to soup.
    uniforms.uSize.value = w < 700 ? 19 : 24;

    if (reducedMotion) renderFrame(0);
  }

  /* ── Render loop ──────────────────────────────────────────────────
     Time is accumulated manually from clamped frame deltas rather than
     read from THREE.Clock. Clock accumulates the entire gap spent with
     the tab backgrounded, which would jump every time-based animation
     forward on return; clamping each step at 50ms keeps them continuous.
     `playing` gates the intro so it cannot play behind the preloader. */
  let raf = null;
  let inView = true;
  let tabVisible = !document.hidden;
  let playing = false;     // set by start(), once the curtain has lifted
  let elapsed = 0;
  let prevNow = 0;

  function renderFrame(t) {
    uniforms.uTime.value = t;

    // Ease pointer toward target — the lag is what makes it feel weighty.
    damped.x += (pointer.x - damped.x) * 0.045;
    damped.y += (pointer.y - damped.y) * 0.045;
    uniforms.uPointer.value.set(damped.x, damped.y);

    if (!reducedMotion) {
      group.rotation.y = damped.x * 0.34 + t * 0.03;
      group.rotation.x = -damped.y * 0.22;
      shell.rotation.y = -t * 0.045;
      shell.rotation.z = t * 0.02;
    }

    renderer.render(scene, camera);
  }

  function tick(now) {
    raf = requestAnimationFrame(tick);

    if (!prevNow) prevNow = now;
    const dt = Math.min((now - prevNow) / 1000, 0.05);
    prevNow = now;
    elapsed += dt;

    // Intro: scattered points converge over ~2.2s. Started from start(),
    // so it plays in view rather than behind the preloader.
    if (playing && uniforms.uIntro.value < 1) {
      uniforms.uIntro.value = Math.min(1, uniforms.uIntro.value + dt / 2.2);
    }

    renderFrame(elapsed);
  }

  function play() {
    if (raf === null) {
      prevNow = 0;   // fresh baseline, so resuming never produces a jump
      raf = requestAnimationFrame(tick);
    }
  }
  function stop() {
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
  }

  function updateRunState() {
    if (reducedMotion) return;
    if (inView && tabVisible) play();
    else stop();
  }

  /* ── Observers ──────────────────────────────────────────────────── */
  const io = new IntersectionObserver(
    ([entry]) => {
      inView = entry.isIntersecting;
      updateRunState();
    },
    { rootMargin: '120px' }
  );
  io.observe(canvas);

  function onVisibility() {
    tabVisible = !document.hidden;
    updateRunState();
  }
  document.addEventListener('visibilitychange', onVisibility);

  const onResize = debounce(resize, 140);
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  function debounce(fn, ms) {
    let id;
    return (...args) => {
      clearTimeout(id);
      id = setTimeout(() => fn(...args), ms);
    };
  }

  /* ── Go ─────────────────────────────────────────────────────────── */
  resize();

  if (reducedMotion) {
    uniforms.uIntro.value = 1;
    renderFrame(0);
  } else {
    // Start rendering immediately so shaders compile and the field is
    // warm behind the preloader — but leave `playing` false, so the
    // converge intro is held back until start() fires.
    play();
  }

  return {
    /** Called by main.js once the preloader has lifted. */
    start() {
      if (reducedMotion) {
        uniforms.uIntro.value = 1;
        renderFrame(0);
        return;
      }
      playing = true;
      play();
    },
    destroy() {
      stop();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (pointerBound) window.removeEventListener('pointermove', onPointerMove);
      geometry.dispose();
      material.dispose();
      shellGeo.dispose();
      shell.material.dispose();
      renderer.dispose();
    },
  };
}
