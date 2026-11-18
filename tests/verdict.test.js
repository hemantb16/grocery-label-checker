import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normalize, tagSet, isBarcode } from '../js/off.js';
import { evaluate, findWords, dataGaps, quoteAt } from '../js/verdict.js';
import { ALLERGENS, DIETS } from '../js/rules.js';

const dir = new URL('./fixtures/', import.meta.url);
const raw = (code) => JSON.parse(readFileSync(new URL(`${code}.json`, dir))).product;
const load = (code) => normalize(code, raw(code));
const ALL = { allergens: ALLERGENS.map((a) => a.id), diets: DIETS.map((d) => d.id) };
const verdictOf = (p, id) => evaluate(p, id.startsWith('d:') ? { diets: [id.slice(2)] } : { allergens: [id] }).checks[0];
const EVERY_ITEM = [...ALLERGENS.map((a) => a.id), ...DIETS.map((d) => `d:${d.id}`)];

// A clean, fully recognised German product with no allergens: the only base that may say "fine".
function clean(over = {}) {
  return {
    code: '4000000000000', name: 'Test', brands: '', lang: 'de',
    texts: [{ lang: 'de', text: 'Zucker, Wasser, Zitronensäure, natürliches Aroma.' }],
    ingredients: ['Zucker', 'Wasser', 'Zitronensäure', 'natürliches Aroma'].map((text) => ({ text, known: true, vegan: 'yes', vegetarian: 'yes' })),
    allergens: new Set(), traces: new Set(), analysis: new Set(['vegan', 'vegetarian']),
    labels: new Set(), additives: [], states: new Set(), nutriscore: null,
    ...over,
  };
}

test('clean product is "fine" for every profile item', () => {
  for (const id of EVERY_ITEM) assert.equal(verdictOf(clean(), id).verdict, 'fine', id);
});

// The core safety property: any data gap gives "unknown" (or "no"), never "fine".
const GAPS = {
  'no ingredient list': { texts: [], ingredients: [] },
  'list not analysed': { ingredients: [] },
  'list marked incomplete': { states: new Set(['ingredients-to-be-completed']) },
  'unrecognised ingredient': { ingredients: [{ text: 'Xyzpulver', known: false, vegan: null, vegetarian: null }] },
  'list only in Italian': { texts: [{ lang: 'it', text: 'zucchero, acqua' }] },
};
for (const [gap, over] of Object.entries(GAPS)) {
  test(`missing data never gives "fine": ${gap}`, () => {
    for (const id of EVERY_ITEM) {
      const c = verdictOf(clean(over), id);
      assert.notEqual(c.verdict, 'fine', `${id} with ${gap}`);
      assert.ok(c.reasons.length > 0, `${id} with ${gap} has a reason`);
    }
  });
}

test('every real fixture, stripped of its ingredient list, is never "fine"', () => {
  for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
    const code = f.replace('.json', '');
    const p = normalize(code, { ...raw(code), ingredients_text: '', ingredients_text_de: '', ingredients_text_en: '', ingredients: [] });
    const r = evaluate(p, ALL);
    assert.notEqual(r.verdict, 'fine', code);
    for (const c of r.checks) assert.notEqual(c.verdict, 'fine', `${code} ${c.id}`);
  }
});

test('empty profile gives no verdict at all', () => {
  assert.equal(evaluate(clean(), { allergens: [], diets: [] }).verdict, null);
});

test('worst check wins', () => {
  const p = clean({ allergens: new Set(['milk']) });
  const r = evaluate(p, { allergens: ['milk', 'peanuts'] });
  assert.equal(r.verdict, 'no');
  assert.equal(r.checks[0].id, 'milk');
});

test('Nutella record with English text stored as German: milk found in text though OFF only tagged nuts', () => {
  const p = load('3017624010701');
  assert.deepEqual([...p.allergens], ['nuts']);
  const milk = verdictOf(p, 'milk');
  assert.equal(milk.verdict, 'no');
  assert.ok(milk.reasons.some((r) => (r.quotes || []).includes('skimmed milk powder (8.7%)')));
  // Unrecognised list: other allergens can't be cleared.
  assert.equal(verdictOf(p, 'mustard').verdict, 'unknown');
});

test('German Nutella: milk quoted from the pack text, soy too, mustard "fine"', () => {
  const p = load('4008400402222');
  const milk = verdictOf(p, 'milk');
  assert.equal(milk.verdict, 'no');
  assert.ok(milk.reasons.some((r) => (r.quotes || []).some((q) => q.startsWith('MAGERMILCHPULVER'))));
  assert.equal(verdictOf(p, 'soybeans').verdict, 'no');
  assert.equal(verdictOf(p, 'mustard').verdict, 'fine');
  assert.equal(verdictOf(p, 'd:vegan').verdict, 'no');
});

test('malformed traces tag is still read', () => {
  assert.deepEqual([...tagSet(['en:en:en:milk  en:nuts  en:soybeans'])], ['milk', 'nuts', 'soybeans']);
  assert.equal(verdictOf(load('4008400402222'), 'nuts').verdict, 'no');
});

test('pastry tagged vegan by OFF but listing eggs is not vegan', () => {
  const p = load('4316268596299');
  assert.ok(p.analysis.has('vegan'));
  assert.equal(verdictOf(p, 'd:vegan').verdict, 'no');
  assert.equal(verdictOf(p, 'gluten').verdict, 'no');
  assert.equal(verdictOf(p, 'd:gluten-free').verdict, 'no');
});

test('traces: "may contain" is "no" for the allergen, irrelevant for lactose-free', () => {
  const p = clean({ traces: new Set(['milk']) });
  const c = verdictOf(p, 'milk');
  assert.equal(c.verdict, 'no');
  assert.match(c.reasons[0].text, /May contain/);
  assert.equal(verdictOf(p, 'd:lactose-free').verdict, 'fine');
});

test('lactose-free label lifts milk for lactose-free diet, never for milk allergy', () => {
  const p = clean({ texts: [{ lang: 'de', text: 'Laktosefreie Milch, Laktase.' }], allergens: new Set(['milk']), labels: new Set(['lactose-free']) });
  assert.equal(verdictOf(p, 'd:lactose-free').verdict, 'fine');
  assert.equal(verdictOf(p, 'milk').verdict, 'no');
});

test('vegan label does not override found animal ingredients', () => {
  const p = clean({ labels: new Set(['vegan']), texts: [{ lang: 'de', text: 'Zucker, Honig.' }] });
  assert.equal(verdictOf(p, 'd:vegan').verdict, 'no');
});

test('OFF "maybe vegan" gives unknown with the doubtful ingredients quoted', () => {
  const p = clean({ analysis: new Set(['maybe-vegan']), ingredients: [{ text: 'natürliches Aroma', known: true, vegan: 'maybe' }] });
  const c = verdictOf(p, 'd:vegan');
  assert.equal(c.verdict, 'unknown');
  assert.deepEqual(c.reasons.at(-1).quotes, ['natürliches Aroma']);
});

test('no pork: Schweinegelatine is "no", plain Gelatine is "unknown", Rindergelatine is fine', () => {
  const t = (text) => verdictOf(clean({ analysis: new Set(), texts: [{ lang: 'de', text }] }), 'd:no-pork').verdict;
  assert.equal(t('Zucker, Schweinegelatine'), 'no');
  assert.equal(t('Zucker, Gelatine'), 'unknown');
  assert.equal(t('Zucker, Rindergelatine'), 'fine');
});

test('gummy bears (Italian list, gelatine) are not "fine" for vegetarians', () => {
  const p = load('4001686301265');
  assert.notEqual(verdictOf(p, 'd:vegetarian').verdict, 'fine');
  assert.equal(verdictOf(p, 'd:vegan').verdict, 'no');
});

test('keyword exclusions: lookalikes do not trigger, real words still do', () => {
  const milk = ALLERGENS.find((a) => a.id === 'milk').groups;
  assert.deepEqual(findWords('Kokosmilch, Kakaobutter, Milchsäure', milk), []);
  assert.deepEqual(findWords('Kakaobutter, Butterreinfett', milk), ['Butterreinfett']);
  const eggs = ALLERGENS.find((a) => a.id === 'eggs').groups;
  assert.deepEqual(findWords('Milcheiweiß, Weizen, glutenfrei', eggs), []);
  assert.deepEqual(findWords('Weizenmehl, Eier aus Bodenhaltung', eggs), ['Eier aus Bodenhaltung']);
  const gluten = ALLERGENS.find((a) => a.id === 'gluten').groups;
  assert.deepEqual(findWords('Buchweizenmehl, Maltodextrin', gluten), []);
  assert.deepEqual(findWords('Gerstenmalzextrakt', gluten), ['Gerstenmalzextrakt']);
  const vegan = DIETS.find((d) => d.id === 'vegan').groups;
  assert.deepEqual(findWords('Fruchtfleisch, Kokosmilch', vegan), []);
  assert.deepEqual(findWords('Zucker, Milcheiweiß', vegan), ['Milcheiweiß']);
  const sulph = ALLERGENS.find((a) => a.id === 'sulphur-dioxide-and-sulphites').groups;
  assert.deepEqual(findWords('Konservierungsstoff: E 223', sulph), ['Konservierungsstoff: E 223']);
  assert.deepEqual(findWords('E2230', sulph), []);
});

test('OFF allergen markup (_milk_) is matched', () => {
  const milk = ALLERGENS.find((a) => a.id === 'milk').groups;
  assert.deepEqual(findWords('sugar, _milk_ powder', milk), ['_milk_ powder']);
});

test('dataGaps quotes the unrecognised words', () => {
  const gaps = dataGaps(load('40084107'));
  assert.ok(gaps.some((g) => g.includes('“Kakaobuiter”')));
});

test('barcode validation', () => {
  for (const ok of ['40084107', '012345678905', '4008400402222', '14008400402222']) assert.ok(isBarcode(ok), ok);
  for (const bad of ['', '123', '4008400402222x', '../../x', '123456789']) assert.ok(!isBarcode(bad), bad);
});

test('quotes keep decimal commas, stop at sentences and drop unbalanced brackets', () => {
  const q = (s, w) => quoteAt(s, s.indexOf(w), w.length);
  assert.equal(q('Zucker, MAGERMILCHPULVER (8,7 %), Kakao', 'MAGERMILCH'), 'MAGERMILCHPULVER (8,7 %)');
  assert.equal(q('VOLLMILCHSCHOKOLADE 47 % (Zucker, VOLLMILCHPULVER), Salz', 'VOLLMILCHSCHOKOLADE'), 'VOLLMILCHSCHOKOLADE 47 %');
  assert.equal(q('Schokolade (Zucker, Milchzucker), Salz', 'Milchzucker'), 'Milchzucker');
  assert.equal(q('humectant (invertase). May contain traces of peanuts, milk', 'peanuts'), 'May contain traces of peanuts');
});

test('GTIN check digit', async () => {
  const { checkDigitOk } = await import('../js/off.js');
  for (const ok of ['4008400402222', '3017624010701', '5449000000996', '036000291452', '40084107']) assert.ok(checkDigitOk(ok), ok);
  for (const bad of ['4008400402223', '3017624010702', '036000291453']) assert.ok(!checkDigitOk(bad), bad);
});

test('run-together harmless words (missing commas) are not a data gap', () => {
  const p = clean({ ingredients: [...clean().ingredients,
    { text: 'Weinsäure Säureregulator Natriumcitrate', known: false }, { text: 'Aspartam Acesulfam K', known: false }] });
  assert.deepEqual(dataGaps(p), []);
  assert.equal(verdictOf(p, 'milk').verdict, 'fine');
});

test('an unrecognised part with one unknown word is still a gap, and an allergen word never counts as harmless', () => {
  for (const text of ['Zitronen Xyzpulver', 'Zucker Magermilchpulver', 'Wasser Senf', 'Aroma Weizenstärke']) {
    const p = clean({ ingredients: [{ text, known: false }] });
    assert.equal(dataGaps(p).length, 1, text);
    for (const id of EVERY_ITEM) assert.notEqual(verdictOf(p, id).verdict, 'fine', `${id}: ${text}`);
  }
});

test('lecithin with a printed plant source and plain sugar settle OFF\'s "maybe vegan"', () => {
  const maybe = (texts, items) => clean({ texts: [{ lang: 'de', text: texts }], analysis: new Set(['maybe-vegan', 'maybe-vegetarian']),
    ingredients: items.map(([text, m]) => ({ text, known: true, vegan: m, vegetarian: m })) });
  const soy = maybe('Zucker, Emulgator Lecithine (Soja).', [['Zucker', 'maybe'], ['Lecithine', 'maybe']]);
  assert.equal(verdictOf(soy, 'd:vegan').verdict, 'fine');
  assert.equal(verdictOf(maybe('Sonnenblumenlecithin, Wasser.', [['Sonnenblumenlecithin', 'maybe']]), 'd:vegetarian').verdict, 'fine');
  // No source printed, or flavouring: still unknown.
  assert.equal(verdictOf(maybe('Zucker, Emulgator Lecithine.', [['Lecithine', 'maybe']]), 'd:vegan').verdict, 'unknown');
  assert.equal(verdictOf(maybe('Zucker, Aroma.', [['Zucker', 'maybe'], ['Aroma', 'maybe']]), 'd:vegan').verdict, 'unknown');
  // Egg lecithin is egg.
  assert.equal(verdictOf(maybe('Zucker, Eilecithin.', [['Eilecithin', 'maybe']]), 'd:vegan').verdict, 'no');
});
