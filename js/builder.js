// Stavba 3D modelu bazénu a okolí z konfigurace.
// Souřadnice: osa X = délka bazénu, osa Z = šířka, Y nahoru, horní hrana bazénu v y = 0.
// Obrysy (THREE.Shape) jsou v rovině XY a otáčí se o -90° kolem X, takže tvar (x, y) → svět (x, 0, -y).
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { COPINGS, FINISHES, LINER_COLORS, LED_COLORS } from './config.js';
import * as TX from './textures.js';

export const WATER_DROP = 0.14; // hladina pod horní hranou
export const COPING_W = 0.35;
const STEP_H = 0.25;
const STEP_T = 0.32;

export function dims(s) {
  const L = s.length;
  const W = s.shape === 'round' ? s.length : s.width;
  const r = s.shape === 'rounded' ? Math.max(0, Math.min(s.radius, Math.min(L, W) / 2 - 0.02)) : 0;
  return { L, W, r };
}

export function depthAt(s, x) {
  if (!s.slope) return s.depth;
  const { L } = dims(s);
  const t = THREE.MathUtils.clamp((x + L / 2) / L, 0, 1);
  return s.depth + (Math.max(s.depthDeep, s.depth) - s.depth) * t;
}

export function halfWidthAt(s, x) {
  const { L, W, r } = dims(s);
  const ax = Math.abs(x);
  if (s.shape === 'oval' || s.shape === 'round') return (W / 2) * Math.sqrt(Math.max(0, 1 - (2 * ax / L) ** 2));
  if (s.shape === 'rounded' && ax > L / 2 - r) {
    const dx = ax - (L / 2 - r);
    return W / 2 - r + Math.sqrt(Math.max(0, r * r - dx * dx));
  }
  return W / 2;
}

// Obrys bazénu (proti směru hodinových ručiček) posunutý o `off` metrů ven.
export function outline(s, off = 0) {
  const { L, W, r } = dims(s);
  const hx = L / 2 + off, hy = W / 2 + off;
  const pts = [];
  if (s.shape === 'oval' || s.shape === 'round') {
    const n = 128;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      pts.push(new THREE.Vector2(hx * Math.cos(a), hy * Math.sin(a)));
    }
    return pts;
  }
  const rr = r > 0 ? r + off : 0;
  const corners = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  corners.forEach(([sx, sy], k) => {
    if (rr <= 0.001) {
      pts.push(new THREE.Vector2(sx * hx, sy * hy));
      return;
    }
    const cx = sx * (hx - rr), cy = sy * (hy - rr);
    const seg = 14;
    for (let i = 0; i <= seg; i++) {
      const a = (k * Math.PI) / 2 + (i / seg) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + rr * Math.cos(a), cy + rr * Math.sin(a)));
    }
  });
  return pts;
}

export function measure(s) {
  const pts = outline(s);
  let area = 0, perim = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    area += a.x * b.y - b.x * a.y;
    perim += a.distanceTo(b);
  }
  area = Math.abs(area) / 2;
  const avgDepth = s.slope ? (s.depth + Math.max(s.depthDeep, s.depth)) / 2 : s.depth;
  const volume = area * (avgDepth - WATER_DROP);
  const interior = area + perim * avgDepth;
  const { L, W } = dims(s);
  const deckW = s.deck === 'grass' ? 0 : s.deckWidth;
  const outerL = L + 2 * (COPING_W + deckW), outerW = W + 2 * (COPING_W + deckW);
  const copingArea = Math.abs(polyArea(outline(s, COPING_W))) - Math.abs(polyArea(pts));
  const deckArea = s.deck === 'grass' ? 0 : outerL * outerW - Math.abs(polyArea(outline(s, COPING_W)));
  return { area, perim, volume, interior, avgDepth, copingArea, deckArea, L, W };
}

function polyArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function flatShapeGeometry(pts, holes = []) {
  const shape = new THREE.Shape(pts);
  holes.forEach((h) => shape.holes.push(new THREE.Path(h)));
  const g = new THREE.ShapeGeometry(shape, 1);
  g.rotateX(-Math.PI / 2);
  return g;
}

function extrudedRing(outer, inner, bottom, height, bevel = 0) {
  const shape = new THREE.Shape(outer);
  if (inner) shape.holes.push(new THREE.Path(inner));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bottom, 0);
  return g;
}

// Hranol z polygonu zadaného ve světových souřadnicích (x, z).
function prism(poly, bottom, top) {
  const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, -p.y)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: top - bottom, bevelEnabled: false });
  g.rotateX(-Math.PI / 2);
  g.translate(0, bottom, 0);
  return g;
}

function wallGeometry(s, pts) {
  const pos = [], nor = [], uv = [], idx = [];
  let acc = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const len = a.distanceTo(b);
    const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len; // normála dovnitř (CCW)
    const da = depthAt(s, a.x), db = depthAt(s, b.x);
    const base = pos.length / 3;
    pos.push(a.x, 0, -a.y, a.x, -da, -a.y, b.x, 0, -b.y, b.x, -db, -b.y);
    for (let k = 0; k < 4; k++) nor.push(nx, 0, -ny);
    uv.push(acc, 0, acc, -da, acc + len, 0, acc + len, -db);
    idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    acc += len;
  }
  // Ověř orientaci trojúhelníků vůči normále, případně otoč.
  const p = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const face = new THREE.Vector3().crossVectors(p(1).sub(p(0)), p(2).sub(p(0)));
  if (face.dot(new THREE.Vector3(nor[0], nor[1], nor[2])) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

const metal = () => new THREE.MeshStandardMaterial({ color: '#d9dde0', metalness: 1, roughness: 0.18 });

// ---------------------------------------------------------------- schodiště
function buildStairs(s, mat, edgeMat) {
  const g = new THREE.Group();
  const { L, W } = dims(s);
  const dShallow = depthAt(s, -L / 2);
  const n = Math.max(1, Math.round(dShallow / STEP_H) - 1);
  const h = dShallow / (n + 1);
  const floorAt = (x) => -depthAt(s, x) - 0.02;
  const SAMPLES = 10;
  const inset = 0.004;

  if (s.stairs === 'full') {
    for (let i = 0; i < n; i++) {
      const x0 = -L / 2 + i * STEP_T, x1 = x0 + STEP_T;
      const poly = [];
      for (let k = 0; k <= SAMPLES; k++) {
        const x = x0 + ((x1 - x0) * k) / SAMPLES;
        poly.push(new THREE.Vector2(x, Math.max(0, halfWidthAt(s, x) - inset)));
      }
      for (let k = SAMPLES; k >= 0; k--) {
        const x = x0 + ((x1 - x0) * k) / SAMPLES;
        poly.push(new THREE.Vector2(x, -Math.max(0, halfWidthAt(s, x) - inset)));
      }
      const top = -(i + 1) * h;
      g.add(mesh(prism(poly, floorAt(x1), top), mat));
      // bezpečnostní hrana schodu
      const e0 = x1 - 0.05;
      const hw = Math.max(0, halfWidthAt(s, x1) - inset - 0.01);
      g.add(mesh(prism([new THREE.Vector2(e0, -hw), new THREE.Vector2(x1, -hw), new THREE.Vector2(x1, hw), new THREE.Vector2(e0, hw)], top, top + 0.003), edgeMat, { cast: false }));
    }
  } else if (s.stairs === 'side') {
    const w = Math.min(1.8, L * 0.35);
    const a = -L / 2 + Math.max(0.5, L * 0.12);
    for (let i = 0; i < n; i++) {
      const poly = [];
      for (let k = 0; k <= SAMPLES; k++) {
        const x = a + (w * k) / SAMPLES;
        poly.push(new THREE.Vector2(x, -halfWidthAt(s, x) + inset + i * STEP_T));
      }
      for (let k = SAMPLES; k >= 0; k--) {
        const x = a + (w * k) / SAMPLES;
        poly.push(new THREE.Vector2(x, -halfWidthAt(s, x) + inset + (i + 1) * STEP_T));
      }
      const top = -(i + 1) * h;
      g.add(mesh(prism(poly, floorAt(a + w), top), mat));
      const edge = [];
      for (let k = 0; k <= SAMPLES; k++) {
        const x = a + (w * k) / SAMPLES;
        edge.push(new THREE.Vector2(x, -halfWidthAt(s, x) + inset + (i + 1) * STEP_T - 0.05));
      }
      for (let k = SAMPLES; k >= 0; k--) {
        const x = a + (w * k) / SAMPLES;
        edge.push(new THREE.Vector2(x, -halfWidthAt(s, x) + inset + (i + 1) * STEP_T));
      }
      g.add(mesh(prism(edge, top, top + 0.003), edgeMat, { cast: false }));
    }
  } else if (s.stairs === 'corner' || s.stairs === 'roman') {
    const corner = s.stairs === 'corner';
    const cx = -L / 2 + inset, cz = corner ? -W / 2 + inset : 0;
    let base = corner ? 0 : 0.6;
    let t = corner ? STEP_T * 1.25 : STEP_T;
    if (!corner) {
      const maxR = W / 2 - 0.15;
      if (base + n * t > maxR) { t = Math.max(0.2, (maxR - 0.3) / n); base = Math.max(0.3, maxR - n * t); }
    }
    for (let k = 1; k <= n; k++) {
      const R = base + k * t;
      const top = -k * h;
      const bottom = floorAt(cx + R);
      const geo = new THREE.CylinderGeometry(R, R, top - bottom, 40, 1, false, 0, corner ? Math.PI / 2 : Math.PI);
      const m = mesh(geo, mat);
      m.position.set(cx, (top + bottom) / 2, cz);
      g.add(m);
      const ring = new THREE.RingGeometry(R - 0.05, R, 40, 1, 0, corner ? Math.PI / 2 : Math.PI);
      ring.rotateX(-Math.PI / 2);
      ring.rotateY(Math.PI / 2);
      const e = mesh(ring, edgeMat, { cast: false });
      e.position.set(cx, top + 0.003, cz);
      g.add(e);
    }
  }
  return g;
}

// ---------------------------------------------------------------- doplňky
function buildLadder() {
  const g = new THREE.Group();
  const mat = metal();
  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.07, -0.42),
    new THREE.Vector3(0, 0.55, -0.42),
    new THREE.Vector3(0, 0.82, -0.3),
    new THREE.Vector3(0, 0.82, -0.02),
    new THREE.Vector3(0, 0.5, 0.12),
    new THREE.Vector3(0, -0.2, 0.14),
    new THREE.Vector3(0, -1.0, 0.1),
  ]);
  for (const x of [-0.27, 0.27]) {
    const tube = mesh(new THREE.TubeGeometry(path, 64, 0.022, 10), mat);
    tube.position.x = x;
    g.add(tube);
  }
  for (const y of [-0.3, -0.58, -0.86]) {
    const step = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.11), mat);
    step.position.set(0, y, 0.1);
    g.add(step);
  }
  return g;
}

function buildCounterflow() {
  const g = new THREE.Group();
  const panel = mesh(new THREE.BoxGeometry(0.04, 0.5, 0.36), metal());
  g.add(panel);
  const nozzle = mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.06, 24), new THREE.MeshStandardMaterial({ color: '#30353a', metalness: 0.6, roughness: 0.3 }));
  nozzle.rotation.z = Math.PI / 2;
  nozzle.position.set(-0.04, -0.08, 0);
  g.add(nozzle);
  const btn = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16), new THREE.MeshStandardMaterial({ color: '#4cc3ff', emissive: '#1a6c99', roughness: 0.3 }));
  btn.rotation.z = Math.PI / 2;
  btn.position.set(-0.03, 0.14, 0);
  g.add(btn);
  return g;
}

function buildEnclosure(s, m) {
  const g = new THREE.Group();
  const span = m.W + 2 * COPING_W + 0.5;
  const length = m.L + 2 * COPING_W + 0.4;
  const segs = Math.max(3, Math.round(length / 2.4));
  const segLen = length / segs;
  const frameMat = new THREE.MeshStandardMaterial({ color: '#c9ced3', metalness: 0.85, roughness: 0.3 });
  const panelMat = new THREE.MeshPhysicalMaterial({
    color: '#dff1ff', transparent: true, opacity: 0.22, roughness: 0.08, metalness: 0,
    side: THREE.DoubleSide, depthWrite: false, clearcoat: 1,
  });
  const arch = (a, b, th) => {
    const shape = new THREE.Shape();
    shape.absellipse(0, 0, a, b, 0, Math.PI, false);
    shape.absellipse(0, 0, a - th, b - th, Math.PI, 0, true);
    return shape;
  };
  for (let i = 0; i < segs; i++) {
    const scale = 1 - i * 0.035;
    const a = (span / 2) * scale, b = Math.min(2.3, 0.75 + span * 0.18) * scale;
    const x0 = -length / 2 + i * segLen;
    const pg = new THREE.ExtrudeGeometry(arch(a, b, 0.012), { depth: segLen, bevelEnabled: false, curveSegments: 48 });
    const panel = new THREE.Mesh(pg, panelMat);
    panel.rotation.y = Math.PI / 2;
    panel.position.x = x0;
    panel.renderOrder = 3;
    g.add(panel);
    for (const fx of [x0, x0 + segLen - 0.06, x0 + segLen / 2]) {
      const fg = new THREE.ExtrudeGeometry(arch(a + 0.01, b + 0.01, 0.06), { depth: 0.06, bevelEnabled: false, curveSegments: 48 });
      const frame = mesh(fg, frameMat);
      frame.rotation.y = Math.PI / 2;
      frame.position.x = fx;
      g.add(frame);
    }
    // kolejnice
    for (const z of [-a, a]) {
      const rail = mesh(new THREE.BoxGeometry(segLen, 0.05, 0.08), frameMat);
      rail.position.set(x0 + segLen / 2, 0.095, z);
      g.add(rail);
    }
  }
  return g;
}

function buildLounger(color) {
  const g = new THREE.Group();
  const frame = new THREE.MeshStandardMaterial({ color: '#e8e8e4', roughness: 0.5 });
  const cushion = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
  const base = mesh(new THREE.BoxGeometry(1.35, 0.08, 0.66), frame);
  base.position.set(0.15, 0.3, 0);
  g.add(base);
  const pad = mesh(new THREE.BoxGeometry(1.3, 0.07, 0.6), cushion);
  pad.position.set(0.15, 0.37, 0);
  g.add(pad);
  const back = mesh(new THREE.BoxGeometry(0.62, 0.08, 0.6), cushion);
  back.position.set(-0.72, 0.52, 0);
  back.rotation.z = -0.55;
  g.add(back);
  for (const [x, z] of [[-0.45, 0.28], [-0.45, -0.28], [0.75, 0.28], [0.75, -0.28]]) {
    const leg = mesh(new THREE.BoxGeometry(0.05, 0.28, 0.05), frame);
    leg.position.set(x, 0.14, z);
    g.add(leg);
  }
  return g;
}

function buildUmbrella() {
  const g = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.025, 0.025, 2.4, 10), new THREE.MeshStandardMaterial({ color: '#d8d4cc', roughness: 0.4 }));
  pole.position.y = 1.2;
  g.add(pole);
  const canopy = mesh(new THREE.ConeGeometry(1.45, 0.45, 8, 1, true), new THREE.MeshStandardMaterial({ color: '#f4efe4', roughness: 0.9, side: THREE.DoubleSide }));
  canopy.position.y = 2.3;
  g.add(canopy);
  const foot = mesh(new THREE.CylinderGeometry(0.25, 0.28, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#555', roughness: 0.6 }));
  foot.position.y = 0.04;
  g.add(foot);
  return g;
}

function buildShower() {
  const g = new THREE.Group();
  const mat = metal();
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.0, 0), new THREE.Vector3(0, 2.25, 0.12), new THREE.Vector3(0, 2.2, 0.38),
  ]);
  g.add(mesh(new THREE.TubeGeometry(curve, 40, 0.035, 12), mat));
  const head = mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 24), mat);
  head.position.set(0, 2.17, 0.4);
  g.add(head);
  const tray = mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 28), new THREE.MeshStandardMaterial({ color: '#6e6e6a', roughness: 0.7 }));
  tray.position.set(0, 0.02, 0.3);
  g.add(tray);
  return g;
}

function buildHeatPump() {
  const g = new THREE.Group();
  const body = mesh(new THREE.BoxGeometry(1.0, 0.68, 0.42), new THREE.MeshStandardMaterial({ color: '#e3e5e6', roughness: 0.45 }));
  body.position.y = 0.38;
  g.add(body);
  const fan = mesh(new THREE.CircleGeometry(0.24, 32), new THREE.MeshStandardMaterial({ color: '#2b2f33', roughness: 0.7 }));
  fan.position.set(-0.17, 0.38, 0.211);
  g.add(fan);
  const grid = mesh(new THREE.TorusGeometry(0.24, 0.012, 6, 32), metal());
  grid.position.copy(fan.position);
  g.add(grid);
  const feet = mesh(new THREE.BoxGeometry(1.05, 0.04, 0.5), new THREE.MeshStandardMaterial({ color: '#555' }));
  feet.position.y = 0.02;
  g.add(feet);
  return g;
}

function buildSolarPanels() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#1d2433', metalness: 0.4, roughness: 0.2 });
  const frameMat = new THREE.MeshStandardMaterial({ color: '#9aa0a6', metalness: 0.8, roughness: 0.35 });
  for (let i = 0; i < 2; i++) {
    const p = mesh(new THREE.BoxGeometry(1.0, 0.04, 2.0), mat);
    p.position.set(i * 1.1, 0.5, 0);
    p.rotation.x = 0;
    p.rotation.z = 0.6;
    g.add(p);
    const leg = mesh(new THREE.BoxGeometry(0.05, 0.5, 1.8), frameMat);
    leg.position.set(i * 1.1 + 0.3, 0.25, 0);
    g.add(leg);
  }
  return g;
}

function dimensionLabel(text, a, b, color = '#ffffff') {
  const g = new THREE.Group();
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
  line.renderOrder = 10;
  g.add(line);
  for (const p of [a, b]) {
    const dir = new THREE.Vector3().subVectors(b, a).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(0.15);
    const tick = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().add(perp), p.clone().sub(perp)]), line.material);
    tick.renderOrder = 10;
    g.add(tick);
  }
  const el = document.createElement('div');
  el.className = 'dim-label';
  el.textContent = text;
  const label = new CSS2DObject(el);
  label.position.copy(a).add(b).multiplyScalar(0.5);
  g.add(label);
  return g;
}

const fmt = (v) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' m';

// ---------------------------------------------------------------- hlavní stavba
export function buildPool(s, shared) {
  const root = new THREE.Group();
  const m = measure(s);
  const { L, W } = dims(s);
  const pts = outline(s);

  // Materiály
  const finish = FINISHES[s.finish];
  const linerHex = LINER_COLORS[s.linerColor].hex;
  const linerMat = new THREE.MeshStandardMaterial({ map: TX.linerTexture(linerHex, s.finish), roughness: finish.roughness });
  const darkLiner = new THREE.Color(linerHex).getHSL({}).l < 0.35;
  const edgeMat = new THREE.MeshStandardMaterial({ color: darkLiner ? '#e9eef0' : '#2c3238', roughness: 0.4 });
  const cop = COPINGS[s.coping];
  const copingMat = new THREE.MeshStandardMaterial({ map: TX.copingTexture(s.coping, cop.hex), roughness: s.coping === 'wood' ? 0.75 : 0.6 });

  // Stěny, dno
  root.add(mesh(wallGeometry(s, pts), linerMat, { cast: false }));
  const floorGeo = flatShapeGeometry(pts);
  const fp = floorGeo.attributes.position;
  for (let i = 0; i < fp.count; i++) fp.setY(i, -depthAt(s, fp.getX(i)));
  floorGeo.computeVertexNormals();
  root.add(mesh(floorGeo, linerMat, { cast: false }));

  // Kaustiky na dně
  const causticGeo = floorGeo.clone();
  causticGeo.translate(0, 0.008, 0);
  const caustics = new THREE.Mesh(causticGeo, shared.causticMat);
  caustics.renderOrder = 1;
  root.add(caustics);

  // Schody
  if (s.stairs !== 'none') root.add(buildStairs(s, linerMat, edgeMat));

  // Lem (koping)
  const copingGeo = extrudedRing(outline(s, COPING_W), outline(s, -0.03), 0, 0.05, 0.008);
  root.add(mesh(copingGeo, copingMat));

  // Hladina
  const waterGeo = flatShapeGeometry(outline(s, -0.002));
  waterGeo.translate(0, -WATER_DROP, 0);
  const water = new THREE.Mesh(waterGeo, shared.waterMat);
  water.renderOrder = 2;
  root.add(water);

  // Terasa a trávník
  const deckW = s.deck === 'grass' ? 0 : s.deckWidth;
  const ox = L / 2 + COPING_W + deckW, oz = W / 2 + COPING_W + deckW;
  const rect = (hx, hz) => [new THREE.Vector2(hx, hz), new THREE.Vector2(-hx, hz), new THREE.Vector2(-hx, -hz), new THREE.Vector2(hx, -hz)];
  if (s.deck !== 'grass') {
    const deckMat = new THREE.MeshStandardMaterial({ map: TX.deckTexture(s.deck), roughness: s.deck === 'wpc' ? 0.6 : 0.8 });
    root.add(mesh(extrudedRing(rect(ox, oz), outline(s, COPING_W - 0.01), -0.06, 0.08), deckMat, { cast: false }));
  }
  const groundMat = new THREE.MeshStandardMaterial({ map: TX.grassTexture(), roughness: 1 });
  const ground = mesh(flatShapeGeometry(rect(80, 80), [s.deck === 'grass' ? outline(s, COPING_W - 0.01) : rect(ox, oz)]), groundMat, { cast: false });
  ground.position.y = -0.01;
  root.add(ground);
  // Žebřík (hluboká strana, strana -Z)
  if (s.ladder) {
    const lx = L / 2 - Math.min(1.2, L * 0.15);
    const ladder = buildLadder();
    ladder.position.set(lx, 0, -halfWidthAt(s, lx));
    root.add(ladder);
  }

  // Protiproud (čelní stěna v hluboké části)
  if (s.counterflow) {
    const cf = buildCounterflow();
    cf.position.set(L / 2 - 0.02, -0.38, 0);
    root.add(cf);
  }

  // LED světla – stěna +Z
  const leds = [];
  const ledHex = LED_COLORS[s.ledColor].hex;
  for (let i = 0; i < s.leds; i++) {
    const x = -L / 2 + (L * (i + 1)) / (s.leds + 1);
    const hw = halfWidthAt(s, x);
    const dx = 0.001, slope = (halfWidthAt(s, x + dx) - halfWidthAt(s, x - dx)) / (2 * dx);
    const lampMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: ledHex, emissiveIntensity: 1.2, roughness: 0.2 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 32), lampMat);
    lamp.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.add(lamp);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.012, 8, 32), metal());
    holder.add(ring);
    const y = -Math.min(0.55, depthAt(s, x) * 0.4);
    holder.position.set(x, y, hw - 0.012);
    holder.rotation.y = Math.atan(slope); // přiklopení na zakřivenou stěnu
    root.add(holder);
    const light = new THREE.PointLight(ledHex, 0, Math.max(6, L * 0.7), 1.4);
    light.position.set(x, y, hw - 0.45);
    root.add(light);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TX.glowTexture(), color: ledHex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.8,
    }));
    glow.scale.setScalar(1.3);
    glow.position.set(x, y, hw - 0.1);
    glow.renderOrder = 4;
    root.add(glow);
    leds.push({ light, lampMat, glow });
  }

  // Zastřešení
  if (s.enclosure) root.add(buildEnclosure(s, m));

  // Okolní doplňky
  const outerZ = W / 2 + COPING_W;
  if (s.loungers) {
    const zl = outerZ + Math.max(1.0, deckW / 2 + 0.1);
    const y = deckW > 1.6 ? 0.02 : 0;
    for (const x of [-0.7, 0.3]) {
      const l = buildLounger('#2f6f8f');
      l.position.set(x, y, zl);
      l.rotation.y = Math.PI / 2;
      root.add(l);
    }
    const u = buildUmbrella();
    u.position.set(-1.5, y, zl + 0.3);
    root.add(u);
  }
  if (s.shower) {
    const sh = buildShower();
    const hx = L / 2 + COPING_W + Math.min(0.6, Math.max(0.45, deckW / 2));
    sh.position.set(hx, deckW > 0 ? 0.02 : 0, -W / 2 - COPING_W - Math.min(0.5, deckW / 2) + 0.05);
    sh.rotation.y = -Math.PI / 4;
    root.add(sh);
  }
  if (s.heating === 'heatpump') {
    const hp = buildHeatPump();
    hp.position.set(ox + 1.0, 0, -oz * 0.4);
    hp.rotation.y = -Math.PI / 2;
    root.add(hp);
  } else if (s.heating === 'solar') {
    const sp = buildSolarPanels();
    sp.position.set(ox + 1.2, 0, -oz * 0.3);
    root.add(sp);
  }

  // Kóty
  const dimsGroup = new THREE.Group();
  const yDim = 0.12;
  const zD = W / 2 + COPING_W + 0.25;
  const xD = -L / 2 - COPING_W - 0.25;
  if (s.shape === 'round') {
    dimsGroup.add(dimensionLabel(`⌀ ${fmt(L)}`, new THREE.Vector3(-L / 2, yDim, zD), new THREE.Vector3(L / 2, yDim, zD)));
  } else {
    dimsGroup.add(dimensionLabel(fmt(L), new THREE.Vector3(-L / 2, yDim, zD), new THREE.Vector3(L / 2, yDim, zD)));
    dimsGroup.add(dimensionLabel(fmt(W), new THREE.Vector3(xD, yDim, -W / 2), new THREE.Vector3(xD, yDim, W / 2)));
  }
  const dl = depthAt(s, -L / 2 + 0.3), dd = depthAt(s, L / 2 - 0.3);
  dimsGroup.add(dimensionLabel(`hl. ${fmt(dl)}`, new THREE.Vector3(-L / 2 + 0.4, 0, 0), new THREE.Vector3(-L / 2 + 0.4, -dl, 0), '#bfe9ff'));
  if (s.slope) dimsGroup.add(dimensionLabel(`hl. ${fmt(dd)}`, new THREE.Vector3(L / 2 - 0.4, 0, 0), new THREE.Vector3(L / 2 - 0.4, -dd, 0), '#bfe9ff'));
  root.add(dimsGroup);

  return { group: root, leds, dimsGroup, measures: m, extent: Math.max(ox, oz) };
}

export function disposeGroup(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isCSS2DObject) o.element.remove();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    // Sdílené materiály (voda, kaustiky) a cache textur se nemažou.
    mats.forEach((mt) => { if (!mt.userData.shared) mt.dispose(); });
  });
}
