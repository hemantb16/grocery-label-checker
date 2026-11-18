// "In short": what's good about a product and what to watch, in plain words, for everyone
// (not tied to the profile). Thresholds are public rules, not opinions (DECISIONS.md D20):
// - "Watch": the UK Food Standards Agency's front-of-pack "high" (red) levels.
// - "Good": the EU nutrition claim rules (Regulation (EC) No 1924/2006, Annex), the levels a
//   maker would need to print "low sugar", "high fibre" and so on.
// Missing values never count as good: a nutrient OFF doesn't have is simply not judged.
import { explainAdditive } from './explain.js';

// [solid per 100 g, liquid per 100 ml]
const HIGH = { sugars: [22.5, 11.25], satfat: [5, 2.5], fat: [17.5, 8.75], salt: [1.5, 0.75] };
const HIGH_WORDS = { sugars: 'sugar', satfat: 'saturated fat', fat: 'fat', salt: 'salt' };

const SWEETENERS = ['e420', 'e421', 'e950', 'e951', 'e952', 'e953', 'e954', 'e955', 'e957', 'e959',
  'e960', 'e961', 'e962', 'e964', 'e965', 'e966', 'e967', 'e968', 'e969'];
const POLYOLS = ['e420', 'e421', 'e953', 'e964', 'e965', 'e966', 'e967', 'e968'];
// Colours that need "may have an adverse effect on activity and attention in children" (Reg. (EC) 1333/2008, Annex V).
const AZO = ['e102', 'e104', 'e110', 'e122', 'e124', 'e129'];

const num = (v) => String(v < 1 ? Math.round(v * 100) / 100 : v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
const base = (tag) => tag.replace(/^(e\d+).*$/, '$1');
const names = (tags) => tags.map((t) => explainAdditive(t).name || t.toUpperCase()).join(', ');

export function summarize(p) {
  const good = [];
  const watch = [];
  const notes = [];
  const n = p.nutrition || {};
  const liq = p.liquid ? 1 : 0;
  const per = p.liquid ? 'per 100 ml' : 'per 100 g';
  const adds = [...new Set(p.additives.map(base))];
  const text = p.texts.map((t) => t.text).join(' ').toLowerCase();

  for (const k of Object.keys(HIGH)) {
    if (n[k] > HIGH[k][liq]) watch.push({ text: `High in ${HIGH_WORDS[k]}: ${num(n[k])} g ${per}.` });
  }
  if (p.nova === 4) {
    // Name what made it ultra-processed, so the line is about this product: "sucralose, flavouring".
    const why = [...new Set((p.novaMarkers || []).map((m) => (/^e\d/.test(m)
      ? (explainAdditive(m).name || m.toUpperCase()) : m.replace(/-/g, ' ')).toLowerCase()))];
    watch.push({ text: why.length
      ? `Ultra-processed (NOVA group 4) because of: ${why.slice(0, 4).join(', ')}${why.length > 4 ? ' and more' : ''}.`
      : 'Ultra-processed (NOVA group 4).' });
  }
  const azo = adds.filter((a) => AZO.includes(a));
  if (azo.length) watch.push({ text: `Contains ${names(azo)}. EU law requires the warning that these colours may affect activity and attention in children.` });

  if (n.sugars <= 0.5) good.push({ text: 'No sugar.' });
  else if (n.sugars <= (liq ? 2.5 : 5)) good.push({ text: `Low in sugar: ${num(n.sugars)} g ${per}.` });
  if (n.fat <= 0.5) good.push({ text: 'No fat.' });
  else if (n.fat <= (liq ? 1.5 : 3)) good.push({ text: `Low in fat: ${num(n.fat)} g ${per}.` });
  if (n.salt <= 0.1) good.push({ text: 'Very little salt.' });
  else if (n.salt <= 0.3) good.push({ text: `Low in salt: ${num(n.salt)} g ${per}.` });
  if (n.fibre >= 6) good.push({ text: `High in fibre: ${num(n.fibre)} g ${per}.` });
  else if (n.fibre >= 3) good.push({ text: `Source of fibre: ${num(n.fibre)} g ${per}.` });
  if (n.kcal > 0 && n.protein >= 0) {
    const share = (n.protein * 4) / n.kcal;
    if (share >= 0.2) good.push({ text: `High in protein: ${num(n.protein)} g ${per}.` });
    else if (share >= 0.12) good.push({ text: `Source of protein: ${num(n.protein)} g ${per}.` });
  }
  if (n.kcal <= (liq ? 4 : 0)) good.push({ text: 'Almost no calories.' });
  else if (n.kcal <= (liq ? 20 : 40)) good.push({ text: `Low in calories: ${num(n.kcal)} kcal ${per}.` });
  if (p.nova === 1) good.push({ text: 'Unprocessed or minimally processed (NOVA group 1).' });

  if ('kcal' in n) notes.push({ text: `${num(n.kcal)} kcal ${per}.` });
  if (!['sugars', 'fat', 'salt'].some((k) => k in n)) notes.push({ text: 'No nutrition values in the database, so sugar, fat and salt can\'t be judged.' });
  const sweet = adds.filter((a) => SWEETENERS.includes(a));
  if (sweet.length) notes.push({ text: `Sweetened with ${names(sweet)}.` });
  if (adds.some((a) => POLYOLS.includes(a))) notes.push({ text: 'Sugar alcohols in larger amounts can have a laxative effect.' });
  if (adds.includes('e951') || adds.includes('e962') || text.includes('phenylalanin')) {
    notes.push({ text: 'Contains phenylalanine. This only matters for people with the rare condition PKU.' });
  }
  if (/koffein|coffein|caffeine/.test(text)) notes.push({ text: 'Contains caffeine.' });
  if (n.alcohol > 0.5) notes.push({ text: `Contains alcohol: ${num(n.alcohol)} % vol.` });

  return { good, watch, notes };
}
