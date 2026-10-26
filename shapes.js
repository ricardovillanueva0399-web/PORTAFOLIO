// Home: green lava-lamp blobs behind the name that merge, carry a grainy gradient and move away from the pointer
(() => {
  const intro = document.querySelector('.intro');
  const canvas = intro && intro.querySelector('.intro-shapes');
  const copy = intro && intro.querySelector('.intro-inner');
  const gl = canvas && canvas.getContext && canvas.getContext('webgl', { antialias: false, premultipliedAlpha: true });
  if (!gl || !copy) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');

  // Blobs as fractions of the hero: x, y and radius (of the shorter side). Weighted to the right of the copy
  const LAYOUT = [
    [0.80, 0.30, 0.11],
    [0.88, 0.43, 0.07],
    [0.72, 0.64, 0.06],
    [0.87, 0.76, 0.10],
    [0.94, 0.17, 0.045],
    [0.64, 0.86, 0.04],
    [0.96, 0.60, 0.05],
  ];
  const PHONE_LAYOUT = [
    [0.94, 0.07, 0.17],
    [0.74, 0.03, 0.08],
    [0.88, 0.97, 0.19],
    [0.62, 1.00, 0.09],
    [0.12, 1.00, 0.08],
    [1.00, 0.80, 0.07],
  ];
  const TEXT_DIM = 0.32;            // opacity over the copy
  const FEATHER = 90;               // px over which that dimming fades out
  const EDGE = 48;                  // px faded at the top and bottom of the screen
  const RADIUS = [180, 120];        // px pushed away around a mouse / a finger
  const DENT = [26, 20];            // px of the hollow the pointer presses into the liquid
  const PUSH = 2.2;
  const SPRING = 0.012;
  const DAMPING = 0.9;
  const RISE = 0.3;                 // of the height the blobs rise on load

  const VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAGMENT = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec3 uBlobs[8];
    uniform vec3 uPointer;
    uniform vec4 uCopy;
    uniform float uFeather, uEdge, uDim, uGrow, uGrain;
    const vec3 DEEP = vec3(0.027, 0.549, 0.012);   // #078C03
    const vec3 NEON = vec3(0.416, 0.949, 0.400);   // #6AF266
    const vec3 MINT = vec3(0.631, 1.0, 0.620);     // #A1FF9E
    float hash(vec2 q) {
      vec3 r = fract(vec3(q.xyx) * 0.1031);
      r += dot(r, r.yzx + 33.33);
      return fract((r.x + r.y) * r.z);
    }
    void main() {
      vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
      float f = 0.0;
      for (int i = 0; i < 8; i++) {
        vec2 d = p - uBlobs[i].xy;
        f += uBlobs[i].z * uBlobs[i].z / (dot(d, d) + 1.0);
      }
      vec2 dp = p - uPointer.xy;
      f -= uPointer.z / (dot(dp, dp) + 1.0);
      // One grain per CSS pixel, fixed to the screen like film
      float n = hash(floor(gl_FragCoord.xy / uGrain)) - 0.5;
      // Grainy edge: the threshold itself is dithered so the rim breaks into specks
      float body = smoothstep(0.94, 1.04, f + n * 0.12);
      float halo = smoothstep(0.6, 0.98, f) * (1.0 - body) * step(0.3, n) * 0.2;
      // Wax lit from below the glass: mint at the top of the screen to deep green at the bottom,
      // darker toward each rim so the blobs read as round
      float y = p.y / uRes.y;
      vec3 base = mix(MINT, NEON, smoothstep(0.0, 0.45, y));
      base = mix(base, DEEP, smoothstep(0.45, 1.0, y));
      vec3 col = mix(base * 0.5, base, smoothstep(0.95, 2.6, f));
      col *= 1.0 + n * 0.3;
      vec2 q = max(max(uCopy.xy - p, p - uCopy.zw), 0.0);
      float t = clamp(length(q) / uFeather, 0.0, 1.0);
      float vis = mix(uDim, 1.0, t * t * (3.0 - 2.0 * t));
      vis *= clamp(min(p.y, uRes.y - p.y) / uEdge, 0.0, 1.0);
      float a = (body * 0.78 + halo) * vis * uGrow;
      gl_FragColor = vec4(col * a, a);
    }`;

  function compile(type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    return shader;
  }
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
  gl.bindAttribLocation(program, 0, 'p');
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const u = {};
  ['uRes', 'uBlobs', 'uPointer', 'uCopy', 'uFeather', 'uEdge', 'uDim', 'uGrow', 'uGrain']
    .forEach(name => (u[name] = gl.getUniformLocation(program, name)));
  const blobData = new Float32Array(24);

  let blobs = [];
  let width = 0;
  let height = 0;
  let dpr = 1;
  let copyRect = { left: 0, top: 0, right: 0, bottom: 0 };
  let born = 0;
  let last = 0;
  let rafId = 0;
  let onScreen = true;
  let dent = 0;                     // how far the pointer's hollow has formed, 0..1
  const pointer = { clientX: 0, clientY: 0, active: false };

  // Union of the copy's line boxes and the buttons, relative to the canvas.
  // The copy fades up 12px on load; measure where it ends up, not where it is mid-animation.
  function measure(rect) {
    const transform = getComputedStyle(copy).transform;
    const shift = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0;
    const range = document.createRange();
    const rects = [];
    intro.querySelectorAll('.tags, .intro-name, .intro-role').forEach(el => {
      range.selectNodeContents(el);
      rects.push(...range.getClientRects());
    });
    intro.querySelectorAll('.hero-actions .btn').forEach(el => rects.push(el.getBoundingClientRect()));
    if (!rects.length) return;
    copyRect = {
      left: Math.min(...rects.map(r => r.left)) - rect.left,
      right: Math.max(...rects.map(r => r.right)) - rect.left,
      top: Math.min(...rects.map(r => r.top)) - rect.top - shift,
      bottom: Math.max(...rects.map(r => r.bottom)) - rect.top - shift,
    };
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
    gl.viewport(0, 0, w, h);
    measure(rect);
    const phone = width < 720;
    const unit = Math.min(width, height);
    const previous = blobs;
    blobs = (phone ? PHONE_LAYOUT : LAYOUT).map(([fx, fy, fr], i) => {
      const old = previous[i];
      const hx = fx * width;
      const hy = fy * height;
      return {
        hx,
        hy,
        r: fr * unit,
        x: old ? hx + old.x - old.hx : hx,
        y: old ? hy + old.y - old.hy : born ? hy : hy + height * RISE,
        vx: 0,
        vy: 0,
        weight: 1.25 - fr * 2,
      };
    });
  }

  function render(grow) {
    blobData.fill(0);
    blobs.forEach((b, i) => {
      blobData[i * 3] = b.x * dpr;
      blobData[i * 3 + 1] = b.y * dpr;
      blobData[i * 3 + 2] = b.r * dpr;
    });
    const rect = canvas.getBoundingClientRect();
    const hollow = DENT[coarsePointer.matches ? 1 : 0] * dpr * dent;
    gl.uniform2f(u.uRes, canvas.width, canvas.height);
    gl.uniform3fv(u.uBlobs, blobData);
    gl.uniform3f(u.uPointer, (pointer.clientX - rect.left) * dpr, (pointer.clientY - rect.top) * dpr, hollow * hollow);
    gl.uniform4f(u.uCopy, copyRect.left * dpr, copyRect.top * dpr, copyRect.right * dpr, copyRect.bottom * dpr);
    gl.uniform1f(u.uFeather, FEATHER * dpr);
    gl.uniform1f(u.uEdge, EDGE * dpr);
    gl.uniform1f(u.uDim, TEXT_DIM);
    gl.uniform1f(u.uGrow, grow);
    gl.uniform1f(u.uGrain, dpr);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    const k = Math.min((now - last) / 16.7, 3);  // same feel at 60 and 120 Hz
    const damping = Math.pow(DAMPING, k);
    last = now;
    const rect = canvas.getBoundingClientRect();
    const px = pointer.clientX - rect.left;
    const py = pointer.clientY - rect.top;
    const radius = RADIUS[coarsePointer.matches ? 1 : 0];
    const near = pointer.active && px > -radius && px < rect.width + radius && py > -radius && py < rect.height + radius;
    const target = near ? 1 : 0;
    dent += (target - dent) * Math.min(1, 0.12 * k);
    if (Math.abs(target - dent) < 0.002) dent = target;
    let moving = now - born < 1600 || dent !== target;
    for (const b of blobs) {
      let ax = (b.hx - b.x) * SPRING;
      let ay = (b.hy - b.y) * SPRING;
      if (near) {
        const dx = b.x - px;
        const dy = b.y - py;
        const dist = Math.hypot(dx, dy);
        const reach = radius + b.r * 0.6;
        if (dist < reach && dist > 0.01) {
          const push = (1 - dist / reach) ** 2 * PUSH * b.weight;
          ax += (dx / dist) * push;
          ay += (dy / dist) * push;
        }
      }
      b.vx = (b.vx + ax * k) * damping;
      b.vy = (b.vy + ay * k) * damping;
      b.x += b.vx * k;
      b.y += b.vy * k;
      if (Math.abs(b.vx) + Math.abs(b.vy) > 0.01) moving = true;
    }
    const t = (now - born) / 1400;
    render(t >= 1 ? 1 : 1 - (1 - t) ** 3);
    // Sleep once everything has settled, until the pointer comes near again
    if (moving) rafId = requestAnimationFrame(frame);
    else rafId = 0;
  }

  function drawStill() {
    blobs.forEach(b => {
      b.x = b.hx;
      b.y = b.hy;
      b.vx = b.vy = 0;
    });
    dent = 0;
    render(1);
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
    else {
      render(1);
      start();
    }
  }

  function track(e) {
    pointer.clientX = e.clientX;
    pointer.clientY = e.clientY;
    pointer.active = true;
    start();
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
    if (pointer.active) start();
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
