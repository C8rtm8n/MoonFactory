import { COPINGS, DECKS, FILTRATION, FINISHES, HEATING, PRICES, SHAPES, STAIRS } from './config.js';

const round = (v) => Math.round(v / 100) * 100;
const n1 = (v) => v.toLocaleString('cs-CZ', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function computePrice(s, m) {
  const items = [];
  const add = (label, price, note = '') => { if (price > 0) items.push({ label, price: round(price), note }); };

  add(`Skelet bazénu – ${SHAPES[s.shape].label.toLowerCase()}`,
    (m.area * PRICES.structurePerM2 + m.volume * PRICES.structurePerM3) * PRICES.shapeFactor[s.shape],
    `${n1(m.area)} m² hladiny`);
  if (s.slope) add('Svažité dno', PRICES.slope);
  add(`Povrchová úprava – ${FINISHES[s.finish].label.toLowerCase()}`, m.interior * FINISHES[s.finish].price, `${n1(m.interior)} m²`);
  add(`Schodiště – ${STAIRS[s.stairs].label.toLowerCase()}`, STAIRS[s.stairs].price);
  add(`Lem – ${COPINGS[s.coping].label.toLowerCase()}`, m.perim * COPINGS[s.coping].price, `${n1(m.perim)} bm`);
  if (s.deck !== 'grass') add(`Terasa – ${DECKS[s.deck].label.toLowerCase()}`, m.deckArea * DECKS[s.deck].price, `${n1(m.deckArea)} m²`);
  add(FILTRATION[s.filtration].label, FILTRATION[s.filtration].price);
  add(HEATING[s.heating].label, HEATING[s.heating].price);
  if (s.leds) add(`LED osvětlení`, s.leds * PRICES.led, `${s.leds} ks`);
  if (s.ladder) add('Nerezový žebřík', PRICES.ladder);
  if (s.counterflow) add('Protiproud', PRICES.counterflow);
  if (s.enclosure) add('Posuvné zastřešení', PRICES.enclosureBase + (m.L + 1) * PRICES.enclosurePerM);
  if (s.shower) add('Zahradní sprcha', PRICES.shower);
  if (s.loungers) add('Lehátka a slunečník', PRICES.loungers);

  const total = items.reduce((a, b) => a + b.price, 0);
  return { items, total };
}

export const formatCZK = (v) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 0 }) + ' Kč';
