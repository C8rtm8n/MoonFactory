import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  COPINGS, DECKS, DEFAULTS, FILTRATION, FINISHES, HEATING, LED_COLORS, LIMITS, LINER_COLORS, SHAPES, STAIRS,
} from './config.js';
import { buildPool, disposeGroup } from './builder.js';
import { causticTexture, waterNormalTexture } from './textures.js';
import { computePrice, formatCZK } from './pricing.js';

// ================================================================ stav
const state = loadState();

function loadState() {
  const s = { ...DEFAULTS };
  try {
    const m = location.hash.match(/c=([^&]+)/);
    if (m) Object.assign(s, sanitize(JSON.parse(decodeURIComponent(escape(atob(m[1]))))));
  } catch { /* neplatný odkaz – použij výchozí */ }
  return s;
}

function sanitize(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (!(k in DEFAULTS) || typeof v !== typeof DEFAULTS[k]) continue;
    out[k] = v;
  }
  const enums = { shape: SHAPES, stairs: STAIRS, finish: FINISHES, linerColor: LINER_COLORS, coping: COPINGS, deck: DECKS, filtration: FILTRATION, heating: HEATING, ledColor: LED_COLORS };
  for (const [k, cat] of Object.entries(enums)) if (k in out && !(out[k] in cat)) delete out[k];
  for (const [k, [a, b]] of Object.entries(LIMITS)) if (k in out) out[k] = THREE.MathUtils.clamp(out[k], a, b);
  if ('leds' in out) out.leds = THREE.MathUtils.clamp(Math.round(out.leds), 0, 4);
  return out;
}

function encodeState() {
  return btoa(unescape(encodeURIComponent(JSON.stringify(state))));
}

function normalize() {
  if (state.shape === 'round') state.length = THREE.MathUtils.clamp(state.length, ...LIMITS.diameter);
  else state.length = THREE.MathUtils.clamp(state.length, ...LIMITS.length);
  state.width = Math.min(state.width, state.shape === 'round' ? state.width : state.length);
  state.depthDeep = Math.max(state.depthDeep, state.depth + 0.2);
  const allowed = STAIRS[state.stairs].shapes;
  if (allowed && !allowed.includes(state.shape)) state.stairs = 'full';
}

// ================================================================ scéna
const viewport = document.getElementById('viewport');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
viewport.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
viewport.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 4000);
camera.position.set(11, 8, 12);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI / 2 - 0.03;
controls.minDistance = 2;
controls.maxDistance = 60;
controls.target.set(0, -0.3, 0);
controls.autoRotateSpeed = 0.6;

// Obloha + slunce
const sky = new Sky();
sky.scale.setScalar(2000);
const skyU = sky.material.uniforms;
skyU.turbidity.value = 4;
skyU.rayleigh.value = 1.4;
skyU.mieCoefficient.value = 0.004;
skyU.mieDirectionalG.value = 0.85;
scene.add(sky);

const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(48), THREE.MathUtils.degToRad(130));
skyU.sunPosition.value.copy(sunDir);

const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene();
const envSky = new Sky();
envSky.scale.setScalar(100);
envSky.material.uniforms.sunPosition.value.copy(sunDir);
for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) envSky.material.uniforms[k].value = skyU[k].value;
envScene.add(envSky);
const dayEnv = pmrem.fromScene(envScene).texture;
scene.environment = dayEnv;

const hemi = new THREE.HemisphereLight('#d8ecff', '#6b7b4c', 0.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff3e0', 2.6);
sun.position.copy(sunDir).multiplyScalar(30);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -16;
sun.shadow.camera.right = sun.shadow.camera.top = 16;
sun.shadow.camera.far = 80;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.02;
scene.add(sun);

scene.fog = new THREE.Fog('#c9dfec', 45, 140);

// Sdílené materiály vody a kaustik (animují se v renderovací smyčce)
const waterNormals = waterNormalTexture();
const waterMat = new THREE.MeshPhysicalMaterial({
  color: '#1f95c4',
  transparent: true,
  opacity: 0.62,
  roughness: 0.03,
  metalness: 0,
  ior: 1.33,
  normalMap: waterNormals,
  normalScale: new THREE.Vector2(0.35, 0.35),
  envMapIntensity: 1.2,
  depthWrite: false,
  specularIntensity: 1,
});
waterMat.userData.shared = true;
const causticTex = causticTexture();
const causticMat = new THREE.MeshBasicMaterial({
  map: causticTex,
  color: '#bfeeff',
  transparent: true,
  opacity: 0.2,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
});
causticMat.userData.shared = true;

let pool = null;
let night = false;
let showDims = true;

function rebuild() {
  normalize();
  if (pool) {
    scene.remove(pool.group);
    disposeGroup(pool.group);
  }
  pool = buildPool(state, { waterMat, causticMat });
  scene.add(pool.group);
  pool.dimsGroup.visible = showDims;
  applyLighting();
  updateSummary();
  try { history.replaceState(null, '', '#c=' + encodeState()); } catch { /* sandbox bez přístupu k URL */ }
}

function applyLighting() {
  if (pool) for (const { light, lampMat, glow } of pool.leds) {
    light.intensity = night ? 45 : 0;
    lampMat.emissiveIntensity = night ? 3 : 0.6;
    glow.visible = night;
  }
  sky.visible = !night;
  scene.background = night ? new THREE.Color('#081322') : null;
  scene.environmentIntensity = night ? 0.05 : 1;
  scene.fog.color.set(night ? '#081322' : '#c9dfec');
  hemi.intensity = night ? 0.12 : 0.6;
  hemi.color.set(night ? '#5b74a8' : '#d8ecff');
  sun.intensity = night ? 0.25 : 2.6;
  sun.color.set(night ? '#9fb6ff' : '#fff3e0');
  causticMat.opacity = night ? (pool && pool.leds.length ? 0.12 : 0) : 0.2;
  causticMat.color.set(night && pool?.leds.length ? LED_COLORS[state.ledColor].hex : '#bfeeff');
  waterMat.color.set(night ? '#2a7fa8' : '#1f95c4');
  waterMat.opacity = night ? 0.35 : 0.62;
  renderer.toneMappingExposure = night ? 1.1 : 0.85;
}

// ================================================================ pohledy
const views = {
  persp: () => [new THREE.Vector3(1.1, 0.75, 1.15), 1],
  top: () => [new THREE.Vector3(0, 1, 0.0001), 1.05],
  side: () => [new THREE.Vector3(0, 0.28, 1), 1],
  low: () => [new THREE.Vector3(0.9, 0.06, 0.5), 0.55],
};
let tween = null;
function setView(name) {
  const [dir, f] = views[name]();
  const fit = (pool?.extent ?? 8) * 1.75 * f + 2.5;
  const to = dir.normalize().multiplyScalar(fit);
  tween = { from: camera.position.clone(), to, fromT: controls.target.clone(), toT: new THREE.Vector3(0, name === 'low' ? -0.1 : -0.3, 0), start: performance.now() };
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
}

// ================================================================ smyčka
const clock = new THREE.Clock();
function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  renderer.setSize(w, h, false);
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewport);

function render() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  waterNormals.offset.set(t * 0.012, t * 0.008);
  causticTex.offset.set(Math.sin(t * 0.15) * 0.08 + t * 0.01, Math.cos(t * 0.12) * 0.08);
  if (tween) {
    const p = Math.min(1, (performance.now() - tween.start) / 700);
    const k = 1 - Math.pow(1 - p, 3);
    camera.position.lerpVectors(tween.from, tween.to, k);
    controls.target.lerpVectors(tween.fromT, tween.toT, k);
    if (p >= 1) tween = null;
  }
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
renderer.setAnimationLoop(render);
controls.addEventListener('start', () => { tween = null; });

// ================================================================ ovládací panel
const controlsEl = document.getElementById('controls');
const openSections = new Set(['shape', 'entry', 'surface']);

const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of children.flat()) if (c != null) el.append(c);
  return el;
};

function set(key, value, { rerenderPanel = true } = {}) {
  state[key] = value;
  rebuild();
  if (rerenderPanel) renderPanel();
}

function segmented(label, key, catalog, { disabled = () => false } = {}) {
  return h('div', { class: 'field' },
    h('span', { class: 'label' }, label),
    h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label },
      Object.entries(catalog).map(([id, o]) => h('button', {
        class: state[key] === id ? 'active' : '',
        role: 'radio',
        'aria-checked': String(state[key] === id),
        disabled: disabled(id, o),
        title: o.price ? `${formatCZK(o.price)}` : null,
        onclick: () => set(key, id),
      }, o.label))));
}

function swatches(label, key, catalog) {
  return h('div', { class: 'field' },
    h('span', { class: 'label' }, label, h('span', { class: 'value' }, catalog[state[key]].label)),
    h('div', { class: 'swatches' },
      Object.entries(catalog).map(([id, o]) => h('button', {
        class: state[key] === id ? 'active' : '',
        style: `background:${o.hex}`,
        title: o.label,
        'aria-label': o.label,
        onclick: () => set(key, id),
      }))));
}

function slider(label, key, [min, max], step, unit = 'm') {
  const value = h('span', { class: 'value' });
  const show = (v) => { value.textContent = `${Number(v).toLocaleString('cs-CZ', { minimumFractionDigits: step < 1 ? 1 : 0, maximumFractionDigits: 2 })} ${unit}`; };
  show(state[key]);
  const input = h('input', {
    type: 'range', min, max, step, value: state[key], 'aria-label': label,
    oninput: (e) => { const v = parseFloat(e.target.value); show(v); set(key, v, { rerenderPanel: false }); },
    onchange: () => renderPanel(),
  });
  return h('div', { class: 'field' }, h('label', {}, label, value), input);
}

function toggle(label, key, note) {
  return h('label', { class: 'toggle' },
    h('span', {}, label, note ? h('small', {}, note) : null),
    h('input', { type: 'checkbox', checked: state[key], onchange: (e) => set(key, e.target.checked) }));
}

function select(label, key, catalog) {
  return segmented(label, key, catalog);
}

function stepper(label, key, min, max) {
  return h('div', { class: 'field' },
    h('span', { class: 'label' }, label),
    h('div', { class: 'stepper' },
      h('button', { 'aria-label': 'Méně', onclick: () => set(key, Math.max(min, state[key] - 1)) }, '−'),
      h('output', {}, String(state[key])),
      h('button', { 'aria-label': 'Více', onclick: () => set(key, Math.min(max, state[key] + 1)) }, '+')));
}

function section(id, n, title, ...content) {
  const d = h('details', { class: 'section', open: openSections.has(id) },
    h('summary', {}, h('span', { class: 'num' }, String(n)), title),
    h('div', { class: 'body' }, ...content));
  d.addEventListener('toggle', () => (d.open ? openSections.add(id) : openSections.delete(id)));
  return d;
}

function renderPanel() {
  const scroll = controlsEl.scrollTop;
  const round = state.shape === 'round';
  controlsEl.replaceChildren(
    section('shape', 1, 'Tvar a rozměry',
      segmented('Tvar bazénu', 'shape', SHAPES),
      slider(round ? 'Průměr' : 'Délka', 'length', round ? LIMITS.diameter : LIMITS.length, 0.1),
      round ? null : slider('Šířka', 'width', [LIMITS.width[0], Math.min(LIMITS.width[1], state.length)], 0.1),
      state.shape === 'rounded' ? slider('Poloměr rohů', 'radius', LIMITS.radius, 0.05) : null,
      slider(state.slope ? 'Hloubka – mělká část' : 'Hloubka', 'depth', LIMITS.depth, 0.05),
      toggle('Svažité dno', 'slope', 'Mělká a hluboká část'),
      state.slope ? slider('Hloubka – hluboká část', 'depthDeep', [Math.max(LIMITS.depthDeep[0], state.depth + 0.2), LIMITS.depthDeep[1]], 0.05) : null,
    ),
    section('entry', 2, 'Vstup do bazénu',
      segmented('Schodiště', 'stairs', STAIRS, { disabled: (id, o) => o.shapes && !o.shapes.includes(state.shape) }),
      toggle('Nerezový žebřík', 'ladder', 'V hluboké části'),
    ),
    section('surface', 3, 'Povrch a barvy',
      segmented('Povrchová úprava', 'finish', FINISHES),
      swatches('Barva', 'linerColor', LINER_COLORS),
      swatches('Lem bazénu', 'coping', COPINGS),
    ),
    section('deck', 4, 'Okolí bazénu',
      segmented('Terasa', 'deck', DECKS),
      state.deck !== 'grass' ? slider('Šířka terasy', 'deckWidth', LIMITS.deckWidth, 0.1) : null,
    ),
    section('tech', 5, 'Technologie',
      select('Úprava vody', 'filtration', FILTRATION),
      select('Ohřev', 'heating', HEATING),
      stepper('Podvodní LED světla', 'leds', 0, 4),
      state.leds ? swatches('Barva světla', 'ledColor', LED_COLORS) : null,
      toggle('Protiproud', 'counterflow', 'Plavání na místě'),
    ),
    section('extras', 6, 'Doplňky',
      toggle('Posuvné zastřešení', 'enclosure', 'Teleskopické, polykarbonát'),
      toggle('Zahradní sprcha', 'shower'),
      toggle('Lehátka a slunečník', 'loungers'),
    ),
  );
  controlsEl.scrollTop = scroll;
}

// ================================================================ souhrn
const fmtNum = (v, d = 1) => v.toLocaleString('cs-CZ', { minimumFractionDigits: d, maximumFractionDigits: d });

function updateSummary() {
  const m = pool.measures;
  const { total } = computePrice(state, m);
  document.getElementById('total').textContent = formatCZK(total);
  document.getElementById('stats').innerHTML = `
    <div><span>Hladina</span><b>${fmtNum(m.area)} m²</b></div>
    <div><span>Objem vody</span><b>${fmtNum(m.volume)} m³</b></div>
    <div><span>Obvod</span><b>${fmtNum(m.perim)} m</b></div>`;
}

function summaryLines() {
  const m = pool.measures;
  const size = state.shape === 'round' ? `⌀ ${fmtNum(m.L, 2)} m` : `${fmtNum(m.L, 2)} × ${fmtNum(m.W, 2)} m`;
  const depth = state.slope ? `${fmtNum(state.depth, 2)} – ${fmtNum(state.depthDeep, 2)} m` : `${fmtNum(state.depth, 2)} m`;
  return [
    ['Tvar', SHAPES[state.shape].label],
    ['Rozměr', size],
    ['Hloubka', depth],
    ['Plocha hladiny', `${fmtNum(m.area)} m²`],
    ['Objem vody', `${fmtNum(m.volume)} m³ (${Math.round(m.volume * 1000).toLocaleString('cs-CZ')} l)`],
    ['Povrch', `${FINISHES[state.finish].label}, ${LINER_COLORS[state.linerColor].label.toLowerCase()}`],
    ['Lem', COPINGS[state.coping].label],
    ['Terasa', state.deck === 'grass' ? 'bez terasy' : `${DECKS[state.deck].label}, šířka ${fmtNum(state.deckWidth)} m`],
  ];
}

function openDetail() {
  const { items, total } = computePrice(state, pool.measures);
  const body = document.getElementById('detail-body');
  body.innerHTML = '';
  body.append(
    h('h3', {}, 'Parametry'),
    h('table', {}, summaryLines().map(([k, v]) => h('tr', {}, h('td', {}, k), h('td', {}, v)))),
    h('h3', {}, 'Orientační rozpočet'),
    h('table', {},
      items.map((it) => h('tr', {}, h('td', {}, it.label, it.note ? h('small', {}, it.note) : null), h('td', {}, formatCZK(it.price)))),
      h('tr', { class: 'total' }, h('td', {}, 'Celkem vč. DPH'), h('td', {}, formatCZK(total)))),
    h('p', { class: 'note' }, 'Ceny jsou orientační a slouží pro první představu. Přesnou nabídku připraví technik po zaměření.'),
  );
  document.getElementById('detail').showModal();
}

function summaryText() {
  const { items, total } = computePrice(state, pool.measures);
  return [
    'Konfigurace bazénu',
    ...summaryLines().map(([k, v]) => `${k}: ${v}`),
    '',
    ...items.map((i) => `${i.label}: ${formatCZK(i.price)}`),
    `Celkem vč. DPH: ${formatCZK(total)}`,
    '',
    location.href,
  ].join('\n');
}

// ================================================================ akce
const toastEl = document.getElementById('toast');
let toastTimer;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function copy(text, okMsg) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMsg);
  } catch {
    prompt('Zkopírujte:', text);
  }
}

function download(name, href) {
  const a = h('a', { href, download: name });
  document.body.append(a);
  a.click();
  a.remove();
}

document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
document.getElementById('btn-night').addEventListener('click', (e) => {
  night = !night;
  e.currentTarget.classList.toggle('active', night);
  e.currentTarget.textContent = night ? '☀️ Den' : '🌙 Noc';
  applyLighting();
});
document.getElementById('btn-dims').addEventListener('click', (e) => {
  showDims = !showDims;
  e.currentTarget.classList.toggle('active', showDims);
  pool.dimsGroup.visible = showDims;
});
document.getElementById('btn-rotate').addEventListener('click', (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.currentTarget.classList.toggle('active', controls.autoRotate);
});
document.getElementById('btn-shot').addEventListener('click', () => {
  renderer.render(scene, camera);
  download('bazen.png', renderer.domElement.toDataURL('image/png'));
});
document.getElementById('btn-share').addEventListener('click', () => copy(location.href, 'Odkaz na konfiguraci zkopírován'));
document.getElementById('btn-reset').addEventListener('click', () => {
  Object.assign(state, DEFAULTS);
  rebuild();
  renderPanel();
  setView('persp');
  toast('Obnoveno výchozí nastavení');
});
document.getElementById('btn-detail').addEventListener('click', openDetail);
document.getElementById('btn-copy').addEventListener('click', () => copy(summaryText(), 'Souhrn zkopírován'));
document.getElementById('btn-print').addEventListener('click', () => window.print());
document.getElementById('btn-json').addEventListener('click', () => {
  const data = { konfigurace: state, ...computePrice(state, pool.measures) };
  download('bazen-konfigurace.json', URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })));
});

// ================================================================ start
rebuild();
renderPanel();
resize();
setView('persp');
camera.position.copy(tween.to);
controls.target.copy(tween.toT);
tween = null;
document.getElementById('loading').remove();
