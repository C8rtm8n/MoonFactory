// Procedurálně generované textury (canvas) – žádné externí obrázky.
// Každá textura představuje `meters` metrů, UV souřadnice geometrie jsou v metrech.
import * as THREE from 'three';

const cache = new Map();

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')];
}

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

function shade(hex, l, s = 0) {
  const c = new THREE.Color(hex);
  c.offsetHSL(0, s, l);
  return '#' + c.getHexString();
}

function toTexture(canvas, meters, color = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / meters, 1 / meters);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

function speckle(ctx, size, rand, count, colors, alpha, maxR = 1.5) {
  for (let i = 0; i < count; i++) {
    ctx.globalAlpha = alpha * rand();
    ctx.fillStyle = colors[(rand() * colors.length) | 0];
    const r = 0.4 + rand() * maxR;
    ctx.fillRect(rand() * size, rand() * size, r, r);
  }
  ctx.globalAlpha = 1;
}

function tileGrid(ctx, size, n, grout, gap, colorFn) {
  ctx.fillStyle = grout;
  ctx.fillRect(0, 0, size, size);
  const cell = size / n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      ctx.fillStyle = colorFn(x, y);
      ctx.fillRect(x * cell + gap / 2, y * cell + gap / 2, cell - gap, cell - gap);
    }
  }
}

export function linerTexture(hex, finish) {
  return cached(`liner-${hex}-${finish}`, () => {
    const rand = rng(1234);
    if (finish === 'mosaic') {
      const [c, ctx] = makeCanvas(512);
      tileGrid(ctx, 512, 32, shade(hex, 0.12, -0.1), 2.5, () => shade(hex, (rand() - 0.5) * 0.14, (rand() - 0.5) * 0.1));
      // lehký lesk na kostičkách
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = '#ffffff';
      for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) ctx.fillRect(x * 16 + 3, y * 16 + 3, 4, 2);
      ctx.globalAlpha = 1;
      return toTexture(c, 1);
    }
    if (finish === 'tiles') {
      const [c, ctx] = makeCanvas(512);
      tileGrid(ctx, 512, 4, shade(hex, 0.15, -0.15), 4, () => shade(hex, (rand() - 0.5) * 0.05));
      speckle(ctx, 512, rand, 3000, [shade(hex, 0.1), shade(hex, -0.08)], 0.35);
      return toTexture(c, 1);
    }
    const [c, ctx] = makeCanvas(256);
    ctx.fillStyle = hex;
    ctx.fillRect(0, 0, 256, 256);
    speckle(ctx, 256, rand, 2500, [shade(hex, 0.06), shade(hex, -0.05)], 0.3);
    // svár fólie
    ctx.fillStyle = shade(hex, -0.04);
    ctx.fillRect(0, 254, 256, 2);
    return toTexture(c, 1.65);
  });
}

function planks(ctx, size, rand, base, count, opts = {}) {
  const w = size / count;
  ctx.fillStyle = opts.gapColor || '#2a1d14';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i++) {
    let x = -rand() * size;
    while (x < size) {
      const len = size * (0.45 + rand() * 0.6);
      const col = shade(base, (rand() - 0.5) * (opts.variation ?? 0.08), (rand() - 0.5) * 0.06);
      const y0 = i * w + 1.5, h = w - 3;
      ctx.fillStyle = col;
      ctx.fillRect(x + 1.5, y0, len - 3, h);
      if (x < 0) ctx.fillRect(x + size + 1.5, y0, len - 3, h); // dlaždicovatelnost
      if (opts.grain !== false) {
        ctx.strokeStyle = shade(base, -0.08);
        ctx.lineWidth = 1;
        for (let g = 0; g < 5; g++) {
          ctx.globalAlpha = 0.15 + rand() * 0.2;
          const gy = y0 + rand() * h;
          ctx.beginPath();
          for (let gx = x; gx < x + len; gx += 8) ctx.lineTo(gx, gy + Math.sin(gx * 0.05 + g) * 1.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
      if (opts.grooves) {
        ctx.fillStyle = shade(base, -0.07);
        for (let g = 1; g < 6; g++) ctx.fillRect(x + 1.5, y0 + (h * g) / 6, len - 3, 1.5);
      }
      x += len;
    }
  }
}

export function deckTexture(type) {
  return cached(`deck-${type}`, () => {
    const rand = rng(99);
    const [c, ctx] = makeCanvas(512);
    switch (type) {
      case 'wood':
        planks(ctx, 512, rand, '#9b6a40', 7);
        return toTexture(c, 1);
      case 'wpc':
        planks(ctx, 512, rand, '#6f6862', 7, { grain: false, grooves: true, variation: 0.03, gapColor: '#262422' });
        return toTexture(c, 1);
      case 'stone':
        tileGrid(ctx, 512, 2, '#8f887c', 5, () => shade('#bdb4a4', (rand() - 0.5) * 0.06));
        speckle(ctx, 512, rand, 9000, ['#a8a091', '#d0c9bb', '#8d8679'], 0.5);
        return toTexture(c, 1);
      case 'concrete':
        tileGrid(ctx, 512, 1, '#8f8e89', 6, () => '#bdbcb6');
        speckle(ctx, 512, rand, 12000, ['#a9a8a2', '#cfcec8', '#9a9993'], 0.45);
        return toTexture(c, 1);
      default:
        return grassTexture();
    }
  });
}

export function grassTexture() {
  return cached('grass', () => {
    const rand = rng(7);
    const [c, ctx] = makeCanvas(512);
    ctx.fillStyle = '#4c7a31';
    ctx.fillRect(0, 0, 512, 512);
    const cols = ['#3d6a27', '#5d8e3b', '#6a9a45', '#456f2c', '#7aa651'];
    for (let i = 0; i < 26000; i++) {
      ctx.strokeStyle = cols[(rand() * cols.length) | 0];
      ctx.globalAlpha = 0.5 + rand() * 0.5;
      const x = rand() * 512, y = rand() * 512;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y - 2 - rand() * 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return toTexture(c, 2);
  });
}

export function copingTexture(id, hex) {
  return cached(`coping-${id}`, () => {
    const rand = rng(31);
    const [c, ctx] = makeCanvas(512);
    if (id === 'wood') {
      planks(ctx, 512, rand, hex, 5);
      return toTexture(c, 1);
    }
    tileGrid(ctx, 512, 2, shade(hex, -0.12), 3, () => shade(hex, (rand() - 0.5) * 0.04));
    const veins = id === 'travertine';
    speckle(ctx, 512, rand, 9000, [shade(hex, 0.06), shade(hex, -0.08), shade(hex, -0.15)], 0.45);
    if (veins) {
      ctx.strokeStyle = shade(hex, -0.12);
      for (let i = 0; i < 40; i++) {
        ctx.globalAlpha = 0.2 + rand() * 0.2;
        const y = rand() * 512;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= 512; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.02 + i) * 3);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    return toTexture(c, 1);
  });
}

// Dlaždicovatelná normálová mapa hladiny (součet sinusovek s celočíselnými frekvencemi).
export function waterNormalTexture() {
  return cached('water', () => {
    const N = 256;
    const rand = rng(5);
    const waves = Array.from({ length: 14 }, () => ({
      fx: Math.round((rand() - 0.5) * 12),
      fy: Math.round((rand() - 0.5) * 12),
      ph: rand() * Math.PI * 2,
      a: 0.4 + rand(),
    }));
    const h = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      let v = 0;
      for (const w of waves) v += Math.sin(((w.fx * x + w.fy * y) / N) * Math.PI * 2 + w.ph) * w.a / (Math.hypot(w.fx, w.fy) + 1);
      h[y * N + x] = v;
    }
    const [c, ctx] = makeCanvas(N);
    const img = ctx.createImageData(N, N);
    const s = 6;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
      const dy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
      let nx = -dx * s, ny = -dy * s, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * N + x) * 4;
      img.data[i] = (nx * 0.5 + 0.5) * 255;
      img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
      img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, 2.5, false);
  });
}

// Kaustiky na dně – dlaždicovatelný Worleyho šum (F2 − F1).
export function causticTexture() {
  return cached('caustics', () => {
    const N = 256, G = 7, cell = N / G;
    const rand = rng(77);
    const pts = [];
    for (let gy = 0; gy < G; gy++) for (let gx = 0; gx < G; gx++) pts.push([(gx + rand()) * cell, (gy + rand()) * cell]);
    const [c, ctx] = makeCanvas(N);
    const img = ctx.createImageData(N, N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell);
      let f1 = 1e9, f2 = 1e9;
      for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
        const gx = cx + ox, gy = cy + oy;
        const p = pts[((gy + G) % G) * G + ((gx + G) % G)];
        const px = p[0] + (gx - ((gx + G) % G)) * cell;
        const py = p[1] + (gy - ((gy + G) % G)) * cell;
        const d = Math.hypot(px - x, py - y);
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      let v = Math.max(0, 1 - (f2 - f1) / (cell * 0.16));
      v = v * v;
      const i = (y * N + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v * 255;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c, 1.6, false);
  });
}

// Měkká záře pro světla (sprite).
export function glowTexture() {
  return cached('glow', () => {
    const [c, ctx] = makeCanvas(128);
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });
}
