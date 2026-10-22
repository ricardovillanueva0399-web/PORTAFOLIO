// Home: a field of small green shapes behind the name that moves away from the pointer
(() => {
  const intro = document.querySelector('.intro');
  const canvas = intro && intro.querySelector('.intro-shapes');
  const copy = intro && intro.querySelector('.intro-inner');
  const ctx = canvas && canvas.getContext && canvas.getContext('2d');
  if (!ctx || !copy) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  const REST = [106, 242, 102];     // #6AF266 at rest
  const LIT = [161, 255, 158];      // #A1FF9E while pushed away
  const ACCENT = [7, 140, 3];       // #078C03, the large ring
  // A repeating sequence along the grid diagonals reads as designed, not random
  const PATTERN = ['cross', 'dot', 'ring', 'cross', 'square', 'dot', 'cross', 'triangle'];
  const GAP = [56, 42];             // px between shapes: desktop, phone
  const MAX_SHAPES = 700;           // the gap widens on very large screens
  const SIZE = 8;                   // px, every small shape
  const LINE = 1.25;
  const ALPHA = 0.3;                // at rest
  const GLOW = 0.6;                 // extra opacity when pushed away
  const TEXT_DIM = 0.3;             // opacity multiplier over the copy
  const BUTTON_DIM = 0.12;          // and over the buttons
  const FEATHER = 64;               // px over which that dimming fades out
  const EDGE = 56;                  // px faded at the top and bottom of the screen
  const RADIUS = [220, 150];        // px pushed away around a mouse / a finger
  const PUSH = 2.2;
  const SPRING = 0.015;
  const DAMPING = 0.9;

  let shapes = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let textRects = [];
  let buttonRects = [];
  let born = 0;
  let last = 0;
  let rafId = 0;
  let onScreen = true;
  let holding = false;              // asleep while a resting pointer keeps shapes pushed
  const pointer = { clientX: 0, clientY: 0, active: false };

  function random(seed) {
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  }

  // Line boxes of the copy (not the full-width blocks) and the buttons, relative to the canvas.
  // The copy fades up 12px on load; measure where it ends up, not where it is mid-animation.
  function measure(rect) {
    const transform = getComputedStyle(copy).transform;
    const shift = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
    const rel = r => ({ left: r.left - rect.left, right: r.right - rect.left, top: r.top - rect.top - shift, bottom: r.bottom - rect.top - shift });
    const range = document.createRange();
    textRects = [];
    intro.querySelectorAll('.tags, .intro-name, .intro-role').forEach(el => {
      range.selectNodeContents(el);
      textRects.push(...[...range.getClientRects()].map(rel));
    });
    buttonRects = [...intro.querySelectorAll('.hero-actions .btn')].map(el => rel(el.getBoundingClientRect()));
  }

  function fade(floor, r, x, y) {
    const dx = Math.max(r.left - x, 0, x - r.right);
    const dy = Math.max(r.top - y, 0, y - r.bottom);
    const t = Math.min(1, Math.hypot(dx, dy) / FEATHER);
    return floor + (1 - floor) * t * t * (3 - 2 * t);
  }

  // How visible a shape may be at (x, y): dimmed near the copy and buttons and at the screen edges
  function visibility(x, y) {
    let v = Math.max(0, Math.min(1, y / EDGE, (height - y) / EDGE));
    for (const r of textRects) v = Math.min(v, fade(TEXT_DIM, r, x, y));
    for (const r of buttonRects) v = Math.min(v, fade(BUTTON_DIM, r, x, y));
    return v;
  }

  function build() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(width * dpr);
    const h = Math.round(height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    measure(rect);

    const phone = width < 720;
    const gap = Math.max(GAP[phone ? 1 : 0], Math.sqrt((width * height) / MAX_SHAPES));
    // One column lines up with the left edge of the copy
    const contentLeft = textRects.length ? Math.min(...textRects.map(r => r.left)) : gap / 2;
    let x0 = ((contentLeft % gap) + gap) % gap;
    if (x0 < SIZE) x0 += gap;  // no column cut in half by the screen edge
    // One large, thin ring in the free space right of the copy as a counterweight to the name
    const textRight = textRects.length ? Math.max(...textRects.map(r => r.right)) : width;
    const free = width - textRight;
    const ring = !phone && free > 280 && {
      hx: textRight + free * 0.55,
      hy: height * 0.62,
      size: Math.min(220, free * 0.6),
      kind: 'bigring',
      weight: 0.5,
      home: 1,
      delay: 300,
    };
    const rand = random(20251);
    const previous = shapes;
    const next = [];
    let row = 0;
    for (let y = gap / 2; y < height; y += gap, row++) {
      let col = 0;
      for (let x = x0; x <= width - SIZE; x += gap, col++) {
        // Leave the ring's stroke clear of grid shapes
        if (ring && Math.abs(Math.hypot(x - ring.hx, y - ring.hy) - ring.size / 2) < SIZE) continue;
        const home = visibility(x, y);
        next.push({
          hx: x,
          hy: y,
          size: SIZE,
          // Inside the copy only dots, so nothing reads as punctuation
          kind: home < 0.9 ? 'dot' : PATTERN[(col + row * 3) % PATTERN.length],
          weight: 0.9 + rand() * 0.4,
          home,
          // Shapes come in as a wave from the right
          delay: (Math.hypot(width - x, y - height / 2) / Math.hypot(width, height)) * 900,
        });
      }
    }
    if (ring) next.push(ring);
    next.forEach((s, i) => {
      const old = previous[i];
      s.x = old ? s.hx + old.x - old.hx : s.hx;
      s.y = old ? s.hy + old.y - old.hy : s.hy;
      s.vx = 0;
      s.vy = 0;
      s.fresh = !old && previous.length > 0;
    });
    shapes = next;
  }

  function draw(s, grow) {
    if (grow <= 0) return;
    const dx = s.x - s.hx;
    const dy = s.y - s.hy;
    const moved = Math.hypot(dx, dy);
    const lit = Math.min(1, moved / 30);
    const visible = moved > 2 ? visibility(s.x, s.y) : s.home;
    const big = s.kind === 'bigring';
    const from = big ? ACCENT : REST;
    const c = from.map((v, i) => Math.round(v + (LIT[i] - v) * lit));
    ctx.globalAlpha = Math.min(1, (big ? 0.35 : ALPHA) + GLOW * lit) * visible * grow;
    ctx.strokeStyle = ctx.fillStyle = `rgb(${c[0]},${c[1]},${c[2]})`;
    ctx.lineWidth = big ? 1 : LINE;
    // Upright at rest; tilts while pushed and straightens as it springs back
    const angle = Math.max(-0.8, Math.min(0.8, dx * 0.02));
    ctx.setTransform(dpr, 0, 0, dpr, s.x * dpr, s.y * dpr);
    ctx.rotate(angle);
    const r = (s.size / 2) * grow;
    ctx.beginPath();
    switch (s.kind) {
      case 'dot':
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        return;
      case 'ring':
      case 'bigring':
        ctx.arc(0, 0, r * (big ? 1 : 0.85), 0, Math.PI * 2);
        break;
      case 'square':
        ctx.rect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
        break;
      case 'triangle':
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.9, r * 0.6);
        ctx.lineTo(-r * 0.9, r * 0.6);
        ctx.closePath();
        break;
      default: // cross
        ctx.moveTo(-r, 0);
        ctx.lineTo(r, 0);
        ctx.moveTo(0, -r);
        ctx.lineTo(0, r);
    }
    ctx.stroke();
  }

  function frame(now) {
    const k = Math.min((now - last) / 16.7, 3);  // same feel at 60 and 120 Hz
    const damping = Math.pow(DAMPING, k);
    last = now;
    const rect = canvas.getBoundingClientRect();
    const px = pointer.clientX - rect.left;
    const py = pointer.clientY - rect.top;
    const radius = RADIUS[coarsePointer.matches ? 1 : 0];
    const near = pointer.active && py > -radius && py < rect.height + radius;
    let moving = now - born < 2000;
    let away = false;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const s of shapes) {
      let ax = (s.hx - s.x) * SPRING;
      let ay = (s.hy - s.y) * SPRING;
      let held = false;
      if (near) {
        const dist = Math.hypot(s.x - px, s.y - py);
        held = dist < radius;
        const hx = s.hx - px;
        const hy = s.hy - py;
        const toHome = Math.hypot(hx, hy);
        if (held && toHome > 0.01) {
          const push = (1 - dist / radius) ** 2 * PUSH * s.weight;
          ax += (hx / toHome) * push;
          ay += (hy / toHome) * push;
        }
      }
      s.vx = (s.vx + ax * k) * damping;
      s.vy = (s.vy + ay * k) * damping;
      s.x += s.vx * k;
      s.y += s.vy * k;
      if (Math.abs(s.vx) + Math.abs(s.vy) > 0.02) moving = true;
      else if (Math.abs(s.x - s.hx) + Math.abs(s.y - s.hy) > 0.3) {
        if (held) away = true;
        else moving = true;
      }
      const t = s.fresh ? Infinity : now - born - s.delay;
      draw(s, t >= 600 ? 1 : t <= 0 ? 0 : 1 - (1 - t / 600) ** 3);
    }
    if (moving) {
      rafId = requestAnimationFrame(frame);
      return;
    }
    // Settled: snap the stragglers home (drawn once more) and sleep until the pointer comes near again
    if (!away) drawStill();
    holding = away;
    rafId = 0;
  }

  function drawStill() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    shapes.forEach(s => {
      s.x = s.hx;
      s.y = s.hy;
      s.vx = s.vy = 0;
      draw(s, 1);
    });
  }

  function start() {
    if (rafId || reduceMotion.matches || !onScreen || document.hidden) return;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    rafId = 0;
  }

  function refresh() {
    stop();
    if (reduceMotion.matches) drawStill();
    else start();
  }

  function rebuild() {
    build();
    if (reduceMotion.matches) drawStill();
    else start();
  }

  function nearField() {
    const rect = canvas.getBoundingClientRect();
    const radius = RADIUS[coarsePointer.matches ? 1 : 0];
    return pointer.clientY > rect.top - radius && pointer.clientY < rect.bottom + radius;
  }

  function track(e) {
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    pointer.active = true;
    if (holding || nearField()) start();
  }

  function release() {
    pointer.active = false;
    start();
  }

  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });
  ['pointerup', 'pointercancel'].forEach(type => window.addEventListener(type, e => {
    if (e.pointerType !== 'mouse') release();
  }, { passive: true }));
  document.documentElement.addEventListener('pointerleave', release);
  window.addEventListener('blur', release);

  // Scrolling moves the field under a resting cursor without a pointermove
  window.addEventListener('scroll', () => {
    if (pointer.active && (holding || nearField())) start();
  }, { passive: true });

  // Build after the first paint (the observer fires once on observe), then again on size
  // changes, once the display font has loaded, on a new pixel ratio and when the copy changes language
  let pending = 0;
  const schedule = () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(() => {
      if (!born) {
        build();
        born = performance.now();
        refresh();
      } else rebuild();
    });
  };
  new ResizeObserver(schedule).observe(canvas);
  if (document.fonts) document.fonts.ready.then(schedule);
  new MutationObserver(schedule).observe(copy, { childList: true, characterData: true, subtree: true });
  (function watchPixelRatio() {
    matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => {
      schedule();
      watchPixelRatio();
    }, { once: true });
  })();

  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    onScreen ? start() : stop();
  }).observe(intro);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', refresh);
})();
