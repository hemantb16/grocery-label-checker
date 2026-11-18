// Open Food Facts client: one product read, then a normalised shape for verdict.js.
export const APP_VERSION = '1.1.0';
const BASE = 'https://world.openfoodfacts.org';
export const FIELDS = ['product_name', 'product_name_de', 'product_name_en', 'brands', 'lang', 'ingredients_text',
  'ingredients_text_de', 'ingredients_text_en', 'ingredients', 'allergens_tags', 'traces_tags',
  'ingredients_analysis_tags', 'additives_tags', 'labels_tags', 'nutriscore_grade', 'states_tags', 'nutriments', 'nova_group',
  'categories_tags', 'product_quantity_unit', 'nova_groups_markers'].join(',');

export const productUrl = (code) => `${BASE}/product/${encodeURIComponent(code)}`;

export function isBarcode(s) {
  return /^\d{8}$|^\d{12,14}$/.test(s);
}

// Returns { found: true, raw } or { found: false }. Throws on network/server errors.
export async function fetchProduct(code, fetchFn = fetch) {
  if (!isBarcode(code)) throw new Error('Not a barcode');
  const res = await fetchFn(`${BASE}/api/v3/product/${code}.json?fields=${FIELDS}`, {
    headers: { 'X-User-Agent': `GroceryLabelChecker/${APP_VERSION} (https://github.com/hemantb16/grocery-label-checker)` },
  });
  if (res.status === 404) return { found: false };
  if (res.status === 429 || res.status === 503) throw new Error('Open Food Facts is busy. Wait a minute and try again.');
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}.`);
  const json = await res.json();
  if (!json.product) return { found: false };
  return { found: true, raw: json.product }; // raw JSON so it can be stored; normalize() at use
}

// "en:milk" -> "milk"; tolerates junk like "en:en:en:milk  en:nuts" seen in real records.
export function tagSet(tags) {
  const out = new Set();
  for (const t of tags || []) {
    for (const part of String(t).split(/[\s,]+/)) {
      const v = part.replace(/^(?:[a-z]{2}:)+/i, '').toLowerCase();
      if (v) out.add(v);
    }
  }
  return out;
}

const flatten = (list) => (list || []).flatMap((i) => [i, ...flatten(i.ingredients)]);

// Per-100 g/ml values; a value OFF doesn't have stays out, so "missing" never reads as 0.
const NUTRIENTS = { kcal: 'energy-kcal_100g', fat: 'fat_100g', satfat: 'saturated-fat_100g', sugars: 'sugars_100g',
  salt: 'salt_100g', fibre: 'fiber_100g', protein: 'proteins_100g', alcohol: 'alcohol_100g' };
function nutrition(n) {
  const out = {};
  for (const [k, key] of Object.entries(NUTRIENTS)) {
    const v = Number(n?.[key]);
    if (n?.[key] !== '' && n?.[key] != null && Number.isFinite(v) && v >= 0) out[k] = v;
  }
  return out;
}

export function normalize(code, p) {
  const texts = [];
  for (const lang of ['de', 'en']) {
    const t = p[`ingredients_text_${lang}`];
    if (t && t.trim()) texts.push({ lang, text: t.trim() });
  }
  const main = (p.ingredients_text || '').trim();
  if (main && !texts.some((t) => t.text === main)) texts.push({ lang: p.lang || '?', text: main });

  const ingredients = flatten(p.ingredients).map((i) => ({
    text: String(i.text || i.id || '').trim(),
    known: Boolean(i.is_in_taxonomy),
    vegan: i.vegan || null,
    vegetarian: i.vegetarian || null,
  }));

  return {
    code,
    name: p.product_name_de || p.product_name || p.product_name_en || '',
    brands: p.brands || '',
    lang: p.lang || '',
    texts,
    ingredients,
    allergens: tagSet(p.allergens_tags),
    traces: tagSet(p.traces_tags),
    analysis: tagSet(p.ingredients_analysis_tags),
    labels: tagSet(p.labels_tags),
    additives: [...tagSet(p.additives_tags)],
    states: tagSet(p.states_tags),
    nutriscore: /^[a-e]$/.test(p.nutriscore_grade || '') ? p.nutriscore_grade : null,
    nutrition: nutrition(p.nutriments),
    nova: [1, 2, 3, 4].includes(Number(p.nova_group)) ? Number(p.nova_group) : null,
    // What made OFF call it ultra-processed, e.g. ["additives", "en:e955"], ["ingredients", "en:flavouring"].
    novaMarkers: (p.nova_groups_markers?.['4'] || []).map((m) => String(m[1] || '').replace(/^[a-z]{2}:/, '')).filter(Boolean),
    liquid: p.product_quantity_unit === 'ml' || tagSet(p.categories_tags).has('beverages'),
  };
}

// GTIN check digit for 12–14 digit codes (EAN-13, UPC-A, GTIN-14). 8-digit codes are
// accepted as typed: EAN-8 and UPC-E use different check rules and are short enough to retype.
export function checkDigitOk(code) {
  if (code.length < 12) return true;
  const d = [...code].map(Number);
  const check = d.pop();
  const sum = d.reverse().reduce((s, n, i) => s + n * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}
