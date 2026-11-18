import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize } from '../js/off.js';
import { summarize } from '../js/summary.js';

const base = (over = {}) => ({ texts: [], additives: [], nutrition: {}, nova: null, liquid: false, ...over });
const texts = (items) => items.map((i) => i.text);

test('missing nutrition is never praised, and is said once', () => {
  const s = summarize(base());
  assert.deepEqual(s.good, []);
  assert.deepEqual(s.watch, []);
  assert.match(texts(s.notes).join(' '), /No nutrition values/);
});

test('high levels use the drink thresholds for drinks', () => {
  // 12 g sugar: high for a drink (over 11.25), not for a solid food (22.5).
  assert.match(texts(summarize(base({ liquid: true, nutrition: { sugars: 12 } })).watch).join(), /High in sugar: 12 g per 100 ml/);
  assert.deepEqual(summarize(base({ nutrition: { sugars: 12 } })).watch, []);
});

test('EU claim levels: no sugar, low salt, high fibre, high protein', () => {
  const s = summarize(base({ nutrition: { sugars: 0.2, salt: 0.25, fibre: 7, protein: 25, kcal: 350, fat: 10 } }));
  const g = texts(s.good).join(' | ');
  assert.match(g, /No sugar/);
  assert.match(g, /Low in salt: 0.25 g/);
  assert.match(g, /High in fibre/);
  assert.match(g, /High in protein/);
  assert.doesNotMatch(g, /fat/i);
});

test('warnings: azo colours, sweeteners, phenylalanine, caffeine, ultra-processed', () => {
  const s = summarize(base({ nova: 4, additives: ['e110', 'e951', 'e955'], texts: [{ lang: 'de', text: 'Wasser, Koffein' }] }));
  const all = texts([...s.watch, ...s.notes]).join(' | ');
  assert.match(all, /Ultra-processed/);
  assert.match(all, /attention in children/);
  assert.match(all, /Sweetened with Aspartame, Sucralose/);
  assert.match(all, /phenylalanine/);
  assert.match(all, /caffeine/);
});

test('real Coca-Cola record: high in sugar, nothing praised for sugar', () => {
  const raw = JSON.parse(readFileSync(new URL('./fixtures/5449000000996.json', import.meta.url))).product;
  const s = summarize(normalize('5449000000996', raw));
  assert.doesNotMatch(texts(s.good).join(), /sugar/i);
});

test('ultra-processed line names what made it so', () => {
  const s = summarize(base({ nova: 4, novaMarkers: ['e955', 'flavouring', 'glucose-syrup'] }));
  assert.match(texts(s.watch).join(), /NOVA group 4\) because of: sucralose, flavouring, glucose syrup\./);
  assert.match(texts(summarize(base({ nova: 4 })).watch).join(), /^Ultra-processed \(NOVA group 4\)\.$/);
});
