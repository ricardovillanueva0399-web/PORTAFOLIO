// Home: green shapes drift behind the name and move away from the pointer
(() => {
  const intro = document.querySelector('.intro');
  const canvas = intro && intro.querySelector('.intro-shapes');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const COLORS = ['#6AF266', '#A1FF9E', '#078C03', '#165914'];
  const KINDS = ['dot', 'ring', 'square', 'triangle', 'cross', 'bar'];
  const AREA_PER_SHAPE = 11000;  // px² of first screen per shape
  const MIN_SHAPES = 34;
  const MAX_SHAPES = 110;
  const SIZE = [5, 15];           // px: far size, extra size for the nearest
  const ALPHA = [0.3, 0.5];       // opacity: far, extra for the nearest
  const LINE = 1.5;
  const RADIUS = 170;             // px around the pointer that pushes shapes away
  const PUSH = [1.4, 2];          // push strength: far, extra for the nearest
  const TEXT_FADE = 0.4;          // shapes behind the copy are dimmed so it stays readable

  let shapes = [];
  let width = 0;
  let height = 0;
  let textBox = null;
  let born = 0;           // entrance start; shapes added by a later resize skip it
  let last = 0;
  let rafId = 0;
  let onScreen = true;
  const pointer = { clientX: 0, clientY: 0, active: false };

  // Seeded so a resize keeps the same composition
  function random(seed) {
    return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  }

  function build() {
    const rect = intro.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Area covered by the tags, name, role and buttons, relative to the canvas
    const boxes = [...intro.querySelectorAll('.intro-inner > *')].map(el => el.getBoundingClientRect());
    textBox = boxes.length && {
      left: Math.min(...boxes.map(b => b.left)) - rect.left - 24,
      right: Math.max(...boxes.map(b => b.right)) - rect.left + 24,
      top: Math.min(...boxes.map(b => b.top)) - rect.top - 24,
      bottom: Math.max(...boxes.map(b => b.bottom)) - rect.top + 24,
    };

    const rand = random(20251);
    const count = Math.round(Math.min(MAX_SHAPES, Math.max(MIN_SHAPES, (width * height) / AREA_PER_SHAPE)));
    const previous = shapes;
    shapes = Array.from({ length: count }, (_, i) => {
      const depth = rand();  // 0 = far, 1 = near
      const s = {
        hx: rand() * width,
        hy: rand() * height,
        depth,
        size: SIZE[0] + depth * SIZE[1],
        kind: KINDS[Math.floor(rand() * KINDS.length)],
        color: COLORS[Math.floor(rand() * COLORS.length)],
        alpha: ALPHA[0] + depth * ALPHA[1],
        angle: rand() * Math.PI * 2,
        spin: (rand() - 0.5) * 0.006,
        phase: rand() * Math.PI * 2,
        delay: rand() * 900,
      };
      const old = previous[i];
      // Keep each shape's current offset from home so a resize doesn't jolt it
      s.x = old ? s.hx + old.x - old.hx : s.hx;
      s.y = old ? s.hy + old.y - old.hy : s.hy;
      s.vx = 0;
      s.vy = 0;
      s.fresh = !old && previous.length > 0;
      return s;
    });
  }

  function behindText(s) {
    return textBox && s.x > textBox.left && s.x < textBox.right && s.y > textBox.top && s.y < textBox.bottom;
  }

  function draw(s, grow) {
    const r = s.size * grow;
    if (r < 0.5) return;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    ctx.globalAlpha = s.alpha * grow * (behindText(s) ? TEXT_FADE : 1);
    ctx.fillStyle = s.color;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = LINE;
    ctx.beginPath();
    switch (s.kind) {
      case 'dot':
        ctx.arc(0, 0, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'ring':
        ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'square':
        ctx.strokeRect(-r / 2, -r / 2, r, r);
        break;
      case 'triangle':
        ctx.moveTo(0, -r * 0.6);
        ctx.lineTo(r * 0.55, r * 0.4);
        ctx.lineTo(-r * 0.55, r * 0.4);
        ctx.closePath();
        ctx.stroke();
        break;
      case 'cross':
        ctx.moveTo(-r / 2, 0);
        ctx.lineTo(r / 2, 0);
        ctx.moveTo(0, -r / 2);
        ctx.lineTo(0, r / 2);
        ctx.stroke();
        break;
      default: // bar
        ctx.moveTo(-r * 0.6, 0);
        ctx.lineTo(r * 0.6, 0);
        ctx.stroke();
    }
    ctx.restore();
  }

  function frame(now) {
    const k = Math.min((now - last) / 16.7, 3);  // same feel at 60 and 120 Hz
    const damping = Math.pow(0.88, k);
    last = now;
    // Pointer in canvas coordinates, recomputed each frame so scrolling keeps it right
    const rect = canvas.getBoundingClientRect();
    const px = pointer.clientX - rect.left;
    const py = pointer.clientY - rect.top;
    const near = pointer.active && py > -RADIUS && py < rect.height + RADIUS;
    ctx.clearRect(0, 0, width, height);
    for (const s of shapes) {
      // Slow drift around the home position, pulled back by a spring
      const tx = s.hx + Math.sin(now * 0.0004 + s.phase) * (4 + s.depth * 6);
      const ty = s.hy + Math.cos(now * 0.0003 + s.phase) * (4 + s.depth * 6);
      let ax = (tx - s.x) * 0.02;
      let ay = (ty - s.y) * 0.02;
      if (near) {
        const dx = s.x - px;
        const dy = s.y - py;
        const dist = Math.hypot(dx, dy);
        if (dist < RADIUS && dist > 0.01) {
          // Near shapes react more than far ones, which reads as depth
          const push = (1 - dist / RADIUS) ** 2 * (PUSH[0] + s.depth * PUSH[1]);
          ax += (dx / dist) * push;
          ay += (dy / dist) * push;
        }
      }
      s.vx = (s.vx + ax * k) * damping;
      s.vy = (s.vy + ay * k) * damping;
      s.x += s.vx * k;
      s.y += s.vy * k;
      s.angle += (s.spin + (s.vx - s.vy) * 0.004) * k;
      const t = now - (s.fresh ? -Infinity : born) - s.delay;
      const grow = t >= 600 ? 1 : t <= 0 ? 0 : 1 - (1 - t / 600) ** 3;
      draw(s, grow);
    }
    rafId = requestAnimationFrame(frame);
  }

  function drawStill() {
    ctx.clearRect(0, 0, width, height);
    shapes.forEach(s => {
      s.x = s.hx;
      s.y = s.hy;
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

  function track(e) {
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    pointer.active = true;
  }

  function rebuild() {
    build();
    if (reduceMotion.matches) drawStill();
  }

  build();
  born = performance.now();
  refresh();

  window.addEventListener('pointermove', track, { passive: true });
  window.addEventListener('pointerdown', track, { passive: true });
  ['pointerup', 'pointercancel'].forEach(type => window.addEventListener(type, e => {
    if (e.pointerType !== 'mouse') pointer.active = false;
  }, { passive: true }));
  document.documentElement.addEventListener('pointerleave', () => { pointer.active = false; });
  window.addEventListener('blur', () => { pointer.active = false; });

  // Rebuild on size changes (also after the display font loads and moves the text box)
  let pending = 0;
  new ResizeObserver(() => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(rebuild);
  }).observe(intro);
  if (document.fonts) document.fonts.ready.then(rebuild);

  // Only animate while the first screen is visible
  new IntersectionObserver(([entry]) => {
    onScreen = entry.isIntersecting;
    onScreen ? start() : stop();
  }).observe(intro);
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  reduceMotion.addEventListener('change', refresh);
})();
