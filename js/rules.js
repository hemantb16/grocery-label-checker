// Keyword groups for the text check (German + English). Each group is
// { words, exclude }. Strings match anywhere (German compounds: "Magermilchpulver"
// contains "milch"); RegExps are for short words that need word boundaries.
// A group's `exclude` phrases are blanked out before that group is matched
// ("Kokosmilch" is not milk, "Milchsäure" is lactic acid). Exclusions are per
// group, so excluding "Milcheiweiß" from the egg group can't hide it from the milk group.
// shortcut: keyword lists back up OFF's own tags and are not complete; extend them from real misses.

const W = (s) => new RegExp(`(?<!\\p{L})${s}(?!\\p{L})`, 'iu');
const E = (n) => new RegExp(`(?<![\\p{L}\\d])e[\\s-]?${n}(?!\\d)`, 'iu');

const MILK = {
  words: ['milch', 'milk', 'sahne', 'rahm', 'butter', 'käse', 'cheese', 'quark', 'joghurt', 'jogurt',
    'yogurt', 'yoghurt', 'molke', 'whey', 'laktose', 'lactose', 'kasein', 'casein', 'ghee', 'kefir',
    'mascarpone', 'mozzarella', 'ricotta', 'schmand', 'skyr', 'topfen', W('cream')],
  exclude: ['kokosmilch', 'kokosnussmilch', 'mandelmilch', 'hafermilch', 'sojamilch', 'reismilch',
    'erdmandelmilch', 'coconut milk', 'almond milk', 'oat milk', 'soy milk', 'soya milk', 'rice milk',
    'milk thistle', 'milchsäure', 'kakaobutter', 'cocoa butter', 'erdnussbutter', 'peanut butter',
    'sheabutter', 'shea butter', 'mandelbutter', 'cashewbutter', 'laktosefrei', 'lactose-free',
    'lactose free', 'cream of tartar'],
};
const EGGS = {
  words: [W('eier?'), 'vollei', 'hühnerei', 'huehnerei', 'flüssigei', 'freilandei', 'bodenhaltungsei',
    'trockenei', 'eigelb', 'eidotter', 'eiklar', 'eiweiß', 'eiweiss', 'eipulver', W('eggs?'), 'egg yolk',
    'egg white', 'lysozym', 'eilecithin', 'egg lecithin'],
  exclude: ['milcheiweiß', 'milcheiweiss', 'molkeneiweiß', 'molkeneiweiss', 'sojaeiweiß', 'sojaeiweiss',
    'erbseneiweiß', 'erbseneiweiss', 'weizeneiweiß', 'weizeneiweiss', 'pflanzeneiweiß', 'pflanzeneiweiss',
    'eggplant', 'egg-free', 'eggless'],
};
const FISH = {
  words: ['fisch', W('fish'), 'lachs', 'salmon', W('tuna'), 'kabeljau', W('cod'), 'sardelle', 'anchov',
    'sardine', 'hering', 'herring', 'makrele', 'mackerel', 'forelle', 'trout', 'pollock', 'scholle',
    'dorsch', W('hake'), 'seehecht', 'pangasius', 'zander', 'karpfen', 'tilapia'],
  exclude: ['tintenfisch', 'shellfish', 'cuttlefish', 'crayfish', 'jellyfish', 'starfish'],
};
const CRUSTACEANS = { words: ['krebs', 'garnele', 'shrimp', 'prawn', 'krabbe', W('crabs?'), 'hummer',
  'lobster', 'languste', 'scampi', 'krill', 'crayfish', 'crustacea'] };
const MOLLUSCS = { words: ['weichtier', 'muschel', W('austern?'), 'oyster', 'mussel', W('clams?'), 'scallop',
  'tintenfisch', 'squid', 'calamar', 'octopus', 'krake', 'schnecke', 'snail', 'sepia', 'mollus'] };
const MEAT = {
  words: ['fleisch', W('meat'), 'schwein', 'pork', W('rind'), 'rinder', 'beef', W('kalb'), 'kalbs', W('veal'),
    W('huhn'), 'hühnerfleisch', 'hühnerbrühe', 'hühnerfett', 'hühnchen', 'chicken', 'hähnchen', 'haehnchen',
    'geflügel', 'poultry', W('pute'), 'puten', 'turkey', W('lamm'), W('lamb'), 'speck', 'bacon', 'schinken',
    W('ham'), 'wurst', 'salami', W('lard'), 'schmalz', W('talg'), 'tallow', 'gelatine', 'gelatin', 'karmin',
    'carmine', 'cochenille', 'cochineal', 'knochen', E(120), E(441)],
  exclude: ['fruchtfleisch', 'kokosfleisch', 'meat-free', 'butterschmalz', 'pflanzenschmalz'],
};
const BEE_ETC = { words: ['honig', 'honey', 'bienenwachs', 'beeswax', 'schellack', 'shellac', 'lanolin',
  'butterschmalz'] };

export const ALLERGENS = [
  { id: 'gluten', name: 'Gluten', hint: 'wheat, rye, barley, oats, spelt',
    groups: [{ words: ['weizen', 'gerste', 'roggen', 'hafer', 'dinkel', 'emmer', 'einkorn', 'kamut',
      'grünkern', 'triticale', 'gluten', 'wheat', 'barley', W('rye'), W('oats?'), 'spelt', 'malz', W('malt'),
      'couscous', 'bulgur', 'seitan'],
    exclude: ['buchweizen', 'buckwheat', 'glutenfrei', 'gluten-free', 'gluten free', 'maltodextrin',
      'maltose', 'maltit'] }] },
  { id: 'crustaceans', name: 'Crustaceans', hint: 'shrimp, crab, lobster', groups: [CRUSTACEANS] },
  { id: 'eggs', name: 'Eggs', groups: [EGGS], additives: ['e1105'] },
  { id: 'fish', name: 'Fish', groups: [FISH] },
  { id: 'peanuts', name: 'Peanuts', groups: [{ words: ['erdnuss', 'erdnüss', 'peanut', 'arachis', 'groundnut'] }] },
  { id: 'soybeans', name: 'Soy', groups: [{ words: ['soja', W('soy'), W('soya'), 'edamame', 'tofu', W('miso'), 'tempeh'] }] },
  { id: 'milk', name: 'Milk', hint: 'includes lactose', groups: [MILK] },
  { id: 'nuts', name: 'Tree nuts', hint: 'hazelnut, almond, walnut, cashew …',
    groups: [{ words: ['haselnuss', 'haselnüss', 'mandel', 'walnuss', 'walnüss', 'cashew', 'pekannuss', 'pecan',
      'pistazie', 'pistachio', 'macadamia', 'paranuss', 'paranüss', 'brazil nut', 'queenslandnuss',
      'hazelnut', 'almond', 'walnut', 'schalenfrücht', 'schalenfruecht', W('nüsse'), W('nuts?'), 'tree nut',
      'nougat', 'marzipan', 'praliné'],
    exclude: ['erdmandel', 'erdnüsse', 'kokosnüsse', 'muskatnüsse', 'coconuts', 'nutmeg', 'doughnut', 'donut'] }] },
  { id: 'celery', name: 'Celery', groups: [{ words: ['sellerie', 'celery', 'celeriac'] }] },
  { id: 'mustard', name: 'Mustard', groups: [{ words: ['senf', 'mustard'] }] },
  { id: 'sesame-seeds', name: 'Sesame', groups: [{ words: ['sesam', 'tahin'] }] },
  { id: 'sulphur-dioxide-and-sulphites', name: 'Sulphites', hint: 'E220–E228',
    groups: [{ words: ['sulfit', 'sulphit', 'schwefeldioxid', 'sulphur dioxide', 'sulfur dioxide', E('22[0-8]')] }],
    additives: ['e220', 'e221', 'e222', 'e223', 'e224', 'e225', 'e226', 'e227', 'e228'] },
  { id: 'lupin', name: 'Lupin', groups: [{ words: ['lupin'] }] },
  { id: 'molluscs', name: 'Molluscs', hint: 'mussels, squid, snails', groups: [MOLLUSCS] },
];

export const DIETS = [
  { id: 'vegan', name: 'Vegan', analysis: 'vegan', label: 'vegan',
    groups: [MILK, EGGS, FISH, CRUSTACEANS, MOLLUSCS, MEAT, BEE_ETC],
    allergens: ['milk', 'eggs', 'fish', 'crustaceans', 'molluscs'],
    additives: ['e120', 'e441', 'e542', 'e901', 'e904', 'e913', 'e1105'] },
  { id: 'vegetarian', name: 'Vegetarian', analysis: 'vegetarian', label: 'vegetarian',
    groups: [FISH, CRUSTACEANS, MOLLUSCS, MEAT],
    allergens: ['fish', 'crustaceans', 'molluscs'],
    additives: ['e120', 'e441', 'e542'] },
  { id: 'gluten-free', name: 'Gluten-free', hint: 'checked as the gluten allergen' },
  { id: 'lactose-free', name: 'Lactose-free', groups: [MILK], allergens: ['milk'], label: 'lactose-free',
    labelWords: ['laktosefrei', 'lactose-free', 'lactose free'] },
  { id: 'no-pork', name: 'No pork',
    groups: [{ words: ['schwein', 'pork', 'speck', 'bacon', 'schinken', W('ham'), W('lard'), 'schmalz'],
      exclude: ['butterschmalz', 'pflanzenschmalz'] }],
    // Gelatine and meat of unstated origin can be pork: "unknown", not "no".
    doubt: [{ words: ['gelatine', 'gelatin', E(441), 'wurst', 'salami', 'fleisch', W('meat'),
      'tierisches fett', 'animal fat'],
    exclude: ['rindergelatine', 'rinder-gelatine', 'beef gelatin', 'fischgelatine', 'fish gelatin',
      'fruchtfleisch', 'kokosfleisch', 'rindfleisch', 'geflügelfleisch', 'hähnchenfleisch', 'putenfleisch',
      'hühnerfleisch', 'beef', 'chicken'] }] },
];

export const LANGUAGE_NAMES = { de: 'German', en: 'English', fr: 'French', it: 'Italian', es: 'Spanish',
  nl: 'Dutch', pl: 'Polish', pt: 'Portuguese', cs: 'Czech', da: 'Danish', sv: 'Swedish', tr: 'Turkish',
  hu: 'Hungarian', ro: 'Romanian', el: 'Greek', hr: 'Croatian', fi: 'Finnish', bg: 'Bulgarian' };

// Words that are harmless for every allergen and diet in this app. When OFF can't
// recognise a part of the list ("Aspartam Acesulfam K": a missing comma) but every word
// in it is here, that part isn't a data gap (DECISIONS.md D21). Deliberately short:
// no starches, spices, flavour carriers or anything that can hide an allergen.
// shortcut: hand-picked from real misses; add words only after checking they're safe for all checks.
export const PLAIN_WORDS = new Set(`
wasser water kohlensäure carbon dioxide zucker sugar salz salt speisesalz
säuerungsmittel säureregulator säureregulatoren acid acidity regulator citronensäure zitronensäure citric
weinsäure tartaric äpfelsäure malic phosphorsäure phosphoric ascorbinsäure ascorbic
natriumcitrat natriumcitrate kaliumcitrat kaliumcitrate calciumcitrat sodium potassium calcium citrate citrates
antioxidationsmittel antioxidant konservierungsstoff konservierungsstoffe preservative kaliumsorbat sorbate
natriumbenzoat benzoate süßungsmittel süssungsmittel sweetener sweeteners aspartam aspartame acesulfam acesulfame
sucralose cyclamat cyclamate saccharin steviolglycoside steviol glycosides
natürliches natürliche natürlicher natürlichen natural aroma aromen flavouring flavourings flavoring
zitrone zitronen lemon limette limetten lime orange orangen apfel äpfel apple
saft saftkonzentrat juice konzentrat concentrate und and mit with aus from enthält contains eine einer a
mittelkettige triglyceride triglyceriden medium chain triglycerides mct
`.trim().split(/\s+/));
