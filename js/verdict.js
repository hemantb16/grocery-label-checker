// Safety-relevant: decides "no" / "unknown" / "fine" per profile item, with quoted reasons.
// Rules (see DECISIONS.md D10–D15): any evidence of "contains" -> no; any data gap -> unknown;
// only a complete, recognised, German/English ingredient list with no hits -> fine.
import { ALLERGENS, DIETS, LANGUAGE_NAMES, PLAIN_WORDS } from './rules.js';

export const RANK = { fine: 0, unknown: 1, no: 2 };

// Blank out excluded phrases with spaces so indexes still line up with the original text.
function blank(lower, phrases) {
  let out = lower;
  for (const p of phrases || []) {
    let i = out.indexOf(p);
    while (i !== -1) {
      out = out.slice(0, i) + ' '.repeat(p.length) + out.slice(i + p.length);
      i = out.indexOf(p, i + p.length);
    }
  }
  return out;
}

// The ingredient (between commas/semicolons) that contains position i, shortened if long.
export function quoteAt(text, i, len) {
  // Delimiters: ";", "," except decimal commas ("8,7 %"), and "." ending a sentence.
  const isDelim = (k) => text[k] === ';'
    || (text[k] === ',' && !(/\d/.test(text[k - 1] || '') && /\d/.test(text[k + 1] || '')))
    || (text[k] === '.' && /\s/.test(text[k + 1] || ''));
  let start = i;
  let end = i + len;
  while (start > 0 && !isDelim(start - 1)) start--;
  while (end < text.length && !isDelim(end)) end++;
  // Drop an unbalanced bracket on the side away from the match: "VOLLMILCHSCHOKOLADE 47 % (Zucker".
  const open = text.lastIndexOf('(', end - 1);
  if (open >= start) {
    const close = text.indexOf(')', open);
    if (close === -1 || close >= end) {
      if (open >= i + len) end = open;
      else if (open < i) start = open + 1;
    }
  }
  let q = text.slice(start, end).trim().replace(/\s+/g, ' ').replace(/^[.:]+|[.:]+$/g, '').trim();
  if ((q.match(/\)/g) || []).length > (q.match(/\(/g) || []).length) q = q.replace(/\)+$/, '').trim();
  if (q.length > 70) {
    const from = Math.max(0, i - 30);
    q = `${from > 0 ? '…' : ''}${text.slice(from, i + len + 30).trim()}…`;
  }
  return q;
}

// Returns unique quotes for every keyword hit of the given groups in the given text.
export function findWords(text, groups) {
  const quotes = [];
  // shortcut: assumes toLowerCase keeps string length (true for German/English text).
  const lower = text.toLowerCase().replace(/_/g, ' ');
  for (const g of groups || []) {
    const hay = blank(lower, g.exclude);
    for (const w of g.words) {
      let i = -1;
      let len = 0;
      if (typeof w === 'string') {
        i = hay.indexOf(w);
        len = w.length;
      } else {
        const m = w.exec(hay);
        if (m) { i = m.index; len = m[0].length; }
      }
      if (i !== -1) {
        const q = quoteAt(text, i, len);
        if (!quotes.includes(q)) quotes.push(q);
      }
    }
  }
  return quotes;
}

// Hits from all text versions; drop a quote that a longer quote already contains ("milk powder" vs "milk powder (8.7%)").
const textHits = (p, groups) => p.texts.flatMap((t) => findWords(t.text, groups))
  .filter((q, i, a) => a.indexOf(q) === i && !a.some((o) => o !== q && o.toLowerCase().includes(q.toLowerCase())))
  .slice(0, 4);
const nameOf = (id) => (ALLERGENS.find((a) => a.id === id) || { name: id }).name;
const list = (xs) => xs.map((x) => `“${x}”`).join(', ');

// Reasons why the data isn't good enough to say "fine". Empty array = data is usable.
export function dataGaps(p) {
  if (!p.texts.length) return ['The database has no ingredient list for this product.'];
  const gaps = [];
  if (p.states.has('ingredients-to-be-completed')) gaps.push('The ingredient list is marked as incomplete in the database.');
  if (!p.ingredients.length) {
    gaps.push('Open Food Facts has not analysed this ingredient list yet.');
  } else {
    const unknown = p.ingredients.filter((i) => !i.known && i.text && !plainOnly(i.text)).map((i) => i.text);
    if (unknown.length) {
      gaps.push(`Open Food Facts could not recognise ${unknown.length === 1 ? 'this part' : 'these parts'} of the list (maybe a typo or another language): ${list(unknown.slice(0, 4))}${unknown.length > 4 ? ` and ${unknown.length - 4} more` : ''}.`);
    }
  }
  if (!p.texts.some((t) => t.lang === 'de' || t.lang === 'en')) {
    const lang = LANGUAGE_NAMES[p.texts[0].lang] || 'another language';
    gaps.push(`The ingredient list is only in ${lang}; this app can double-check German and English lists only.`);
  }
  return gaps;
}

// A part made only of words this app knows are harmless (single letters like the K in "Acesulfam K" are ignored).
export const plainOnly = (text) => {
  const words = text.toLowerCase().match(/\p{L}{2,}/gu) || [];
  return words.length > 0 && words.every((w) => PLAIN_WORDS.has(w));
};

const result = (verdict, reasons) => ({ verdict, reasons });

export function checkAllergen(p, a) {
  const reasons = [];
  if (p.allergens.has(a.id)) reasons.push({ text: `Listed as an allergen in the database: ${a.name.toLowerCase()}.` });
  const hits = textHits(p, a.groups);
  if (hits.length) reasons.push({ text: 'The ingredient list says:', quotes: hits });
  const adds = (a.additives || []).filter((e) => p.additives.includes(e));
  if (adds.length) reasons.push({ text: `Contains additive ${adds.map((e) => e.toUpperCase()).join(', ')}.` });
  if (reasons.length) return result('no', reasons);
  if (p.traces.has(a.id)) return result('no', [{ text: `May contain traces of ${a.name.toLowerCase()} (“may contain” on the pack).` }]);
  const gaps = dataGaps(p);
  if (gaps.length) return result('unknown', gaps.map((text) => ({ text })));
  return result('fine', [{ text: `Not listed as an allergen or trace, and no ${a.name.toLowerCase()} words found in the ingredient list.` }]);
}

// OFF marks some ingredients "maybe" animal-derived that the pack itself settles (DECISIONS.md D23):
// lecithin whose plant source is printed ("Lecithine (Soja)", "Sonnenblumenlecithin") and plain sugar.
const PLANT = '(?:soja|soy|sonnenblumen|sunflower|raps|rapeseed)';
const PLANT_LECITHIN = new RegExp(String.raw`${PLANT}\s*-?\s*lecithin|lecithin\w*\s*\(\s*(?:aus\s+|from\s+)?${PLANT}`, 'i');
const SUGAR = /^(?:zucker|sugar|rübenzucker|beet sugar|azúcar|sucre|zucchero)$/i;
export const plantProven = (text, p) => SUGAR.test(text.trim())
  || (/lecithin/i.test(text) && p.texts.some((t) => PLANT_LECITHIN.test(t.text)));

function checkVegLike(p, d) {
  // Strongest evidence first (the pack's own words); OFF's tags are shown only when the text check found nothing.
  const reasons = [];
  const hits = textHits(p, d.groups);
  if (hits.length) reasons.push({ text: 'The ingredient list says:', quotes: hits });
  if (!hits.length && p.analysis.has(`non-${d.analysis}`)) {
    const bad = p.ingredients.filter((i) => i[d.analysis] === 'no').map((i) => i.text);
    reasons.push({ text: `Open Food Facts marks it as not ${d.analysis}.`, quotes: bad.length ? bad.slice(0, 4) : undefined });
  }
  const tags = d.allergens.filter((id) => p.allergens.has(id));
  if (!reasons.length && tags.length) reasons.push({ text: `Allergen list includes ${tags.map((id) => nameOf(id).toLowerCase()).join(', ')}.` });
  const adds = d.additives.filter((e) => p.additives.includes(e));
  if (adds.length) reasons.push({ text: `Contains additive ${adds.map((e) => e.toUpperCase()).join(', ')}, which is usually animal-derived.` });
  if (reasons.length) return result('no', reasons);

  const gaps = dataGaps(p).map((text) => ({ text }));
  const labelled = p.labels.has(d.label);
  const maybe = p.ingredients.filter((i) => i[d.analysis] === 'maybe');
  const doubtful = maybe.filter((i) => !plantProven(i.text, p)).map((i) => i.text);
  const settled = p.analysis.has(`maybe-${d.analysis}`) && maybe.length > 0 && !doubtful.length;
  if (!labelled && !p.analysis.has(d.analysis) && !settled) {
    gaps.push(doubtful.length
      ? { text: `Open Food Facts can't tell whether these come from animals:`, quotes: doubtful.slice(0, 4) }
      : { text: `Open Food Facts could not tell whether it is ${d.analysis}.` });
  }
  if (gaps.length) return result('unknown', gaps);
  return result('fine', [{ text: labelled ? `Labelled ${d.analysis} on the pack, and no animal ingredients found.`
    : settled ? `No animal ingredients found. ${list(maybe.map((i) => i.text))} is plant-based (source on the pack, or plain sugar).`
      : `Open Food Facts analysis says ${d.analysis}, and no animal ingredients found.` }]);
}

function checkLactose(p, d) {
  const hits = textHits(p, d.groups);
  const tagged = p.allergens.has('milk');
  if (hits.length || tagged) {
    const labelled = p.labels.has(d.label) || textHits(p, [{ words: d.labelWords }]).length > 0;
    if (labelled) return result('fine', [{ text: 'Contains milk but is labelled lactose-free.' }]);
    const reasons = [];
    if (tagged) reasons.push({ text: 'Listed as an allergen in the database: milk.' });
    if (hits.length) reasons.push({ text: 'The ingredient list says:', quotes: hits });
    return result('no', reasons);
  }
  const gaps = dataGaps(p);
  if (gaps.length) return result('unknown', gaps.map((text) => ({ text })));
  return result('fine', [{ text: 'No milk listed as an allergen and no milk words found in the ingredient list.' }]);
}

function checkPork(p, d) {
  const hits = textHits(p, d.groups);
  if (hits.length) return result('no', [{ text: 'The ingredient list says:', quotes: hits }]);
  const veg = p.analysis.has('vegetarian') || p.labels.has('vegetarian') || p.labels.has('vegan');
  const doubt = veg ? [] : textHits(p, d.doubt);
  const reasons = dataGaps(p).map((text) => ({ text }));
  if (doubt.length) reasons.push({ text: 'Could be pork (animal not named):', quotes: doubt });
  if (!veg && p.additives.includes('e441')) reasons.push({ text: 'Contains E441 (gelatine), which is often made from pork.' });
  if (reasons.length) return result('unknown', reasons);
  return result('fine', [{ text: veg ? 'Vegetarian, so no pork.' : 'No pork words and no gelatine or unnamed meat in the ingredient list.' }]);
}

// profile: { allergens: [ids], diets: [ids] }. Returns { verdict, checks } or verdict null for an empty profile.
export function evaluate(p, profile) {
  const allergenIds = new Set(profile.allergens || []);
  const diets = new Set(profile.diets || []);
  if (diets.has('gluten-free')) allergenIds.add('gluten');
  const checks = [];
  for (const a of ALLERGENS) {
    if (allergenIds.has(a.id)) checks.push({ id: a.id, name: a.name, ...checkAllergen(p, a) });
  }
  for (const d of DIETS) {
    if (!diets.has(d.id) || d.id === 'gluten-free') continue;
    const fn = d.id === 'lactose-free' ? checkLactose : d.id === 'no-pork' ? checkPork : checkVegLike;
    checks.push({ id: d.id, name: d.name, ...fn(p, d) });
  }
  if (!checks.length) return { verdict: null, checks };
  const verdict = checks.reduce((w, c) => (RANK[c.verdict] > RANK[w] ? c.verdict : w), 'fine');
  checks.sort((a, b) => RANK[b.verdict] - RANK[a.verdict]);
  return { verdict, checks };
}
