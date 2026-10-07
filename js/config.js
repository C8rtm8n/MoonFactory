// Katalog voleb konfigurátoru a orientační ceny (Kč vč. DPH).

export const SHAPES = {
  rect: { label: 'Obdélník' },
  rounded: { label: 'Zaoblený' },
  oval: { label: 'Ovál' },
  round: { label: 'Kruh' },
};

export const STAIRS = {
  none: { label: 'Bez schodů', price: 0 },
  full: { label: 'Přes celou šířku', price: 48000 },
  side: { label: 'Boční vstup', price: 36000, shapes: ['rect', 'rounded', 'oval'] },
  corner: { label: 'Rohové', price: 29000, shapes: ['rect'] },
  roman: { label: 'Románské', price: 42000, shapes: ['rect', 'rounded'] },
};

export const FINISHES = {
  foil: { label: 'Fólie', price: 950, roughness: 0.55 },
  mosaic: { label: 'Mozaika', price: 3400, roughness: 0.22 },
  tiles: { label: 'Dlažba', price: 2300, roughness: 0.3 },
};

export const LINER_COLORS = {
  white: { label: 'Bílá', hex: '#e8eef0' },
  sky: { label: 'Světle modrá', hex: '#8fcbe6' },
  blue: { label: 'Modrá', hex: '#2f7fc1' },
  lagoon: { label: 'Laguna', hex: '#4fa79b' },
  sand: { label: 'Písková', hex: '#d8c6a0' },
  grey: { label: 'Šedá', hex: '#99a2a8' },
  anthracite: { label: 'Antracit', hex: '#394047' },
};

export const COPINGS = {
  white: { label: 'Bílý kámen', hex: '#eeebe3', price: 1900 },
  travertine: { label: 'Travertin', hex: '#d8c4a0', price: 3100 },
  granite: { label: 'Šedá žula', hex: '#8b9095', price: 2600 },
  dark: { label: 'Tmavý kámen', hex: '#45484c', price: 2800 },
  wood: { label: 'Dřevo', hex: '#9a6b43', price: 2300 },
};

export const DECKS = {
  wood: { label: 'Dřevo', price: 2900 },
  wpc: { label: 'WPC', price: 3400 },
  stone: { label: 'Kámen', price: 2400 },
  concrete: { label: 'Beton', price: 1600 },
  grass: { label: 'Trávník', price: 0 },
};

export const FILTRATION = {
  sand: { label: 'Pískový filtr', price: 42000 },
  salt: { label: 'Filtr + solinátor', price: 79000 },
  uv: { label: 'Filtr + UV lampa', price: 61000 },
};

export const HEATING = {
  none: { label: 'Bez ohřevu', price: 0 },
  solar: { label: 'Solární ohřev', price: 32000 },
  heatpump: { label: 'Tepelné čerpadlo', price: 89000 },
};

export const LED_COLORS = {
  white: { label: 'Bílá', hex: '#fff6e0' },
  cyan: { label: 'Tyrkysová', hex: '#3fe0ff' },
  blue: { label: 'Modrá', hex: '#2a6bff' },
  violet: { label: 'Fialová', hex: '#a64dff' },
  green: { label: 'Zelená', hex: '#36e07a' },
};

export const PRICES = {
  structurePerM2: 7200, // skelet + výkopy na m² hladiny
  structurePerM3: 3600, // na m³ objemu
  shapeFactor: { rect: 1, rounded: 1.08, oval: 1.15, round: 1.1 },
  slope: 18000,
  ladder: 12000,
  led: 6500,
  counterflow: 65000,
  enclosureBase: 120000,
  enclosurePerM: 24000,
  shower: 9000,
  loungers: 21000,
};

export const LIMITS = {
  length: [3, 15],
  diameter: [3, 8],
  width: [2, 7],
  radius: [0.2, 2],
  depth: [1, 2],
  depthDeep: [1.2, 2.6],
  deckWidth: [0.6, 4],
};

export const DEFAULTS = {
  shape: 'rect',
  length: 8,
  width: 4,
  radius: 0.8,
  depth: 1.2,
  slope: false,
  depthDeep: 1.8,
  stairs: 'full',
  ladder: false,
  finish: 'foil',
  linerColor: 'sky',
  coping: 'white',
  deck: 'wood',
  deckWidth: 2,
  filtration: 'sand',
  heating: 'heatpump',
  leds: 2,
  ledColor: 'cyan',
  counterflow: false,
  enclosure: false,
  shower: true,
  loungers: true,
};
