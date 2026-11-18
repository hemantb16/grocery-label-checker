import { LANGUAGE_NAMES as LANG_NAME } from './rules.js';
import { summarize } from './summary.js';
import { fetchProduct, normalize, isBarcode, checkDigitOk, productUrl, FIELDS } from './off.js';
import { explainAdditive, germanTerms } from './explain.js';
import { startScanner } from './scan.js';

const $ = (sel, root = document) => root.querySelector(sel);
const KEY_RECENT = 'glc.recent';
const RECENT_MAX = 40;
const FRESH_MS = 10 * 60 * 1000; // re-use a lookup this recent instead of calling the API again

// Small DOM helper. Text always goes through textContent: product data is untrusted.
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid);
  return el;
}

// --- storage (localStorage can throw in private modes; the app still works without it) ---
function load(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}
const getRecent = () => load(KEY_RECENT, []);

function remember(code, raw) {
  const list = getRecent().filter((r) => r.code !== code);
  list.unshift({ code, raw, at: Date.now(), fields: FIELDS });
  save(KEY_RECENT, list.slice(0, RECENT_MAX));
}

// --- views ---
const VIEWS = ['scan', 'result', 'history', 'about'];
let stopCamera = null;

function show(name) {
  for (const v of VIEWS) $(`#view-${v}`).hidden = v !== name;
  for (const a of document.querySelectorAll('[data-nav]')) {
    if (a.dataset.nav === name) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  }
  if (name !== 'scan') closeCamera();
  window.scrollTo(0, 0);
}

function route() {
  const [, view, arg] = location.hash.match(/^#\/(\w+)\/?(.*)$/) || [];
  if (view === 'p' && isBarcode(arg)) return openProduct(arg);
  if (view === 'history') { renderHistory(); return show('history'); }
  if (view === 'about') return show('about');
  $('#scan-status').textContent = '';
  show('scan');
}

// --- scan view ---

function closeCamera() {
  if (stopCamera) stopCamera();
  stopCamera = null;
  $('#viewfinder').hidden = true;
  $('#camera-btn').textContent = 'Scan a barcode';
}

async function toggleCamera() {
  if (stopCamera) return closeCamera();
  const status = $('#scan-status');
  status.textContent = 'Starting camera…';
  $('#viewfinder').hidden = false;
  try {
    stopCamera = await startScanner($('#video'), (code) => {
      stopCamera = null;
      closeCamera();
      if (navigator.vibrate) navigator.vibrate(40);
      location.hash = `#/p/${code}`;
    });
    $('#camera-btn').textContent = 'Stop camera';
    status.textContent = 'Hold the barcode inside the frame.';
  } catch (err) {
    closeCamera();
    status.textContent = err.name === 'NotAllowedError'
      ? 'Camera access was blocked. Allow it in the browser settings, or type the number below.'
      : `${err.message || 'The camera could not start.'} You can type the number instead.`;
  }
}

function submitManual(e) {
  e.preventDefault();
  const code = $('#code').value.replace(/\D/g, '');
  const status = $('#scan-status');
  if (!isBarcode(code)) { status.textContent = 'A barcode number has 8, 12, 13 or 14 digits.'; return; }
  if (!checkDigitOk(code)) { status.textContent = 'That number doesn\'t add up (the last digit is a check digit). Is there a typo?'; return; }
  $('#code').value = '';
  location.hash = `#/p/${code}`;
}

// --- product lookup ---
async function openProduct(code) {
  const view = $('#view-result');
  view.replaceChildren(h('p', { class: 'status', text: `Looking up ${code}…` }));
  show('result');
  const cached = getRecent().find((r) => r.code === code);
  let raw = cached?.raw;
  let note = null;
  // A copy saved by an older version lacks newer fields, so it isn't fresh.
  if (!cached || cached.fields !== FIELDS || Date.now() - cached.at > FRESH_MS) {
    try {
      const res = await fetchProduct(code);
      if (!res.found) return renderNotFound(code);
      raw = res.raw;
    } catch (err) {
      if (!cached) return renderError(code, err);
      note = `Offline or no answer from Open Food Facts. Showing the copy saved on ${new Date(cached.at).toLocaleDateString()}.`;
    }
  }
  if (location.hash !== `#/p/${code}`) return; // user moved on while we waited
  remember(code, raw);
  renderResult(normalize(code, raw), note);
}

function renderResult(p, note) {
  const view = $('#view-result');
  const frag = $('#tpl-result').content.cloneNode(true);
  $('.product-name', frag).textContent = p.name || 'Unnamed product';
  $('.product-meta', frag).textContent = [p.brands, p.code].filter(Boolean).join(' · ');
  if (note) $('.product', frag).after(h('p', { class: 'status', text: note }));

  $('.short', frag).replaceChildren(...shortList(p));
  $('.blocks', frag).replaceChildren(...tiles(p));
  $('.source', frag).replaceChildren('Data: ', h('a', { href: productUrl(p.code), rel: 'noopener', text: 'Open Food Facts' }),
    ' (ODbL). Wrong or missing? You can fix it there.');
  view.replaceChildren(frag);
}

// "In short": coloured panels for watch out / good / worth knowing, for everyone.
function shortList(p) {
  const { good, watch, notes } = summarize(p);
  const panel = (cls, title, items) => (items.length
    ? h('div', { class: `panel ${cls}` }, h('h2', { text: title }), h('ul', {}, items.map((i) => h('li', { text: i.text }))))
    : null);
  const out = [panel('watch', 'Watch out', watch), panel('good', 'Good', good), panel('notes', 'Worth knowing', notes)].filter(Boolean);
  return out.length ? out : [h('p', { class: 'muted', text: 'Not enough data in the database for a summary.' })];
}

// Tiles: one number or letter each; tapping one opens its details in the panel under the grid.
function tiles(p) {
  const list = [];
  if (p.nutriscore) {
    list.push({ label: 'Nutri-Score', value: p.nutriscore.toUpperCase(), cls: `n-${p.nutriscore}`, body: [
      h('p', { class: 'nutri' }, ...'abcde'.split('').map((l) => h('span', { class: l === p.nutriscore ? `on n-${l}` : '', text: l.toUpperCase(), 'aria-hidden': 'true' })),
        h('span', { class: 'sr', text: `Nutri-Score ${p.nutriscore.toUpperCase()}` })),
      h('p', { class: 'muted', text: 'A (best) to E, from the overall nutrition values. It says nothing about allergens.' })] });
  }
  const t = p.texts.find((x) => x.lang === 'de') || p.texts[0];
  list.push(t
    ? { label: 'Ingredients', value: String(p.ingredients.length || '–'), sub: LANG_NAME[t.lang] ? `in ${LANG_NAME[t.lang]}` : '', body: h('p', { class: 'ingredients', lang: t.lang, text: t.text }) }
    : { label: 'Ingredients', value: '–', sub: 'missing', body: h('p', { class: 'muted', text: 'The database has no ingredient list for this product.' }) });
  const terms = t ? germanTerms(t.text) : [];
  if (terms.length) {
    list.push({ label: 'German words', value: String(terms.length), sub: 'explained',
      body: h('dl', { class: 'gloss' }, terms.flatMap((x) => [h('dt', { lang: 'de', text: x.word }), h('dd', {}, x.en, x.note ? h('span', { class: 'muted', text: ` ${x.note}` }) : null)])) });
  }
  // "e460" next to "e460i" is the same additive twice; keep the more specific one.
  const tags = p.additives.filter((a) => /^e\d/.test(a));
  const adds = tags.filter((a) => !tags.some((o) => o !== a && o.startsWith(a))).map(explainAdditive);
  list.push({ label: 'Additives', value: String(adds.length),
    sub: adds.length ? adds.slice(0, 3).map((a) => a.code.toUpperCase()).join(' ') + (adds.length > 3 ? ' …' : '') : 'none listed',
    body: adds.length ? h('dl', { class: 'gloss' }, adds.flatMap((a) => [
      h('dt', {}, h('span', { class: 'enum', text: a.code.toUpperCase() }), a.name ? ` ${a.name}` : ''),
      h('dd', {}, a.note || 'No note for this one yet. ', a.note ? null : h('a', { href: `https://world.openfoodfacts.org/additive/${a.code}`, rel: 'noopener', text: 'See it on Open Food Facts' })),
    ])) : h('p', { class: 'muted', text: 'No additives (E-numbers) are listed for this product.' }) });

  const panel = h('div', { class: 'tile-panel', id: 'tile-panel', hidden: true });
  const buttons = list.map((x) => {
    const b = h('button', { type: 'button', class: 'tile', 'aria-expanded': 'false', 'aria-controls': 'tile-panel' },
      h('span', { class: 'tile-label', text: x.label }),
      h('span', { class: `tile-value ${x.cls || ''}`, text: x.value }),
      x.sub ? h('span', { class: 'tile-sub', text: x.sub }) : null);
    b.addEventListener('click', () => {
      const wasOpen = b.getAttribute('aria-expanded') === 'true';
      for (const o of buttons) o.setAttribute('aria-expanded', 'false');
      panel.hidden = wasOpen;
      if (!wasOpen) {
        b.setAttribute('aria-expanded', 'true');
        panel.replaceChildren(h('h2', { text: x.label }), ...[x.body].flat());
      }
    });
    return b;
  });
  return [h('section', { class: 'details' }, h('h2', { text: 'Details' }),
    h('div', { class: 'tiles' }, buttons), panel)];
}


function renderNotFound(code) {
  $('#view-result').replaceChildren(
    h('div', { class: 'verdict unknown' }, h('p', { class: 'verdict-word', text: 'Not found.' }), h('p', { class: 'verdict-sub', text: `Barcode ${code} is not in Open Food Facts yet.` })),
    h('p', {}, 'Check the pack yourself. You can also add the product to ',
      h('a', { href: 'https://world.openfoodfacts.org/contribute', rel: 'noopener', text: 'Open Food Facts' }),
      ' with their free app, so it works for the next person.'),
    h('div', { class: 'actions' }, h('a', { class: 'button primary', href: '#/scan', text: 'Scan another' })));
}

function renderError(code, err) {
  $('#view-result').replaceChildren(
    h('div', { class: 'verdict unknown' }, h('p', { class: 'verdict-word', text: 'No answer.' }), h('p', { class: 'verdict-sub', text: err.message || 'The lookup failed.' })),
    h('p', {}, navigator.onLine ? 'Try again in a moment.' : 'You seem to be offline. Products you checked before still open from Recent.'),
    h('div', { class: 'actions' }, h('a', { class: 'button primary', href: `#/p/${code}`, text: 'Try again', id: 'retry' }), h('a', { class: 'button', href: '#/scan', text: 'Back' })));
  $('#retry').addEventListener('click', (e) => { e.preventDefault(); openProduct(code); });
}

// --- history ---
function renderHistory() {
  const list = getRecent();
  $('#recent-list').replaceChildren(...(list.length ? list.map((r) => {
    const p = normalize(r.code, r.raw);
    return h('li', {}, h('a', { href: `#/p/${r.code}` },
      h('span', { class: 'recent-name', text: p.name || r.code }),
      p.nutriscore ? h('span', { class: `recent-nutri n-${p.nutriscore}`, text: p.nutriscore.toUpperCase(), title: 'Nutri-Score' }) : null),
    h('span', { class: 'muted recent-date', text: new Date(r.at).toLocaleDateString() }));
  }) : [h('li', { class: 'muted', text: 'Nothing yet.' })]));
  $('#clear-history').hidden = !list.length;
}

// --- wiring ---
$('#camera-btn').addEventListener('click', toggleCamera);
$('#manual').addEventListener('submit', submitManual);
$('#clear-history').addEventListener('click', () => {
  if (!confirm('Remove all recent scans from this phone?')) return;
  save(KEY_RECENT, []);
  renderHistory();
});
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.hidden) closeCamera(); });
route();

// Only works on https or localhost; elsewhere registration fails quietly and the app runs online-only.
navigator.serviceWorker?.register('sw.js').catch(() => {});
