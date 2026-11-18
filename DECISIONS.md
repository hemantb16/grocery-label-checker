# Design decisions

A running log: what was decided, why, and what was given up. Newest phase last.

## Phase 0: data, licences, API use (checked 2026-11-18)

**D1. PWA, not a native app.**
Play Store ($25) and App Store ($99/year) fees break the free-only rule. A
static site on GitHub Pages costs nothing, installs to the home screen on
Android and iOS, and can use the camera.

**D2. Open Food Facts API v3, product endpoint only.**
`GET https://world.openfoodfacts.org/api/v3/product/{barcode}.json?fields=…`.
The docs mark v3 as recommended for new integrations and v2 as deprecated.
Reads need no account. `fields=` keeps each response to a few KB.
No search endpoint is used (its limit is lower and the app doesn't need it).

**D3. Rate limit: 15 product reads per minute per IP.**
Requests go straight from each user's phone, so the limit applies per user.
A person scanning by hand stays well below it. The app also skips the
network for a barcode it looked up in the last 10 minutes (recent scans are
kept on the device), which covers the "scan the same thing twice" case.

**D4. Identification: `X-User-Agent` header.**
OFF asks every client to send `AppName/Version (contact)` as User-Agent so they
can reach the author instead of blocking traffic. Browsers don't let pages set
`User-Agent`. OFF's documentation has no browser-specific guidance (a forum
question about exactly this is unanswered), but the API's CORS response lists
`X-User-Agent` in `Access-Control-Allow-Headers`, so that is what the app
sends: `GroceryLabelChecker/<version> (https://github.com/hemantb16/grocery-label-checker)`.
The contact is the repository URL, not an e-mail address.
Trade-off: the custom header makes browsers send a CORS preflight; OFF caches
it for 20 days (`Access-Control-Max-Age: 1728000`).

**D5. Licences of the data and what they require.**
- Database: ODbL 1.0. Individual values (ingredient lists, tags): DbCL 1.0.
- Obligations for this app: credit Open Food Facts with a link and name the
  licence wherever data is shown (done on every result and on the About
  screen). Share-alike applies to derived *databases*; the app builds none,
  it only shows single records. Recent scans stay on the user's own device.
- Test fixtures in `tests/fixtures/` are unmodified API responses for seven
  products, with the same attribution (see `tests/fixtures/SOURCE.md`).

**D6. No product images.**
OFF photos are CC BY-SA 3.0, which needs per-image attribution of the
contributor, and OFF warns that packaging can carry third-party rights
(trademarks, designs). Showing them adds licence bookkeeping and data use for
no safety benefit. Each result links to the product's OFF page instead, where
the photos (and the real pack text) can be checked.

**D7. Additive and German-ingredient explanations are written for this project.**
OFF's additive taxonomy is usable data, but its descriptions come from mixed
sources (some Wikipedia text under CC BY-SA). Short notes written from scratch
avoid that and can be written for this audience. They are covered by the
project's MIT licence. Only E-numbers and words are taken from the product data.

**D8. Privacy.**
The profile and recent scans live only in `localStorage`. The only thing
sent anywhere is the barcode, to OFF (which also sees the user's IP address, as
any website would). No analytics, no third-party scripts, no CDN: the one
library is vendored.

**D9. Barcode scanning: `BarcodeDetector`, then ZXing.**
Chrome on Android has the native `BarcodeDetector`. Safari on iPhone doesn't,
so the app falls back to `@zxing/library` 0.23.0 (Apache-2.0), vendored from
the npm tarball after checking its sha512 against the registry. It is loaded
only when the native detector is missing. Both paths read frames from the
same `<video>` element, so there is one camera code path.

## Phase 2: verdict logic

**D10. Three answers, worst one wins.**
Each profile item (an allergen or a diet) gets `no`, `unknown` or `fine`. The
overall answer is the worst of them. `fine` is always shown as "Probably fine".

**D11. OFF's tags are not trusted alone; the raw text is checked too.**
Real records showed why: a Nutella record whose English ingredient list was
stored as German, so OFF parsed nothing and tagged only nuts (not milk); and a
pastry tagged "vegan" whose allergen list says eggs. So every check combines
OFF's allergen/trace/analysis tags *and* German and English keyword lists run
on the ingredient text. Any one of them saying "contains" gives `no`.

**D12. Missing or doubtful data gives `unknown`, never `fine`.**
`fine` needs all of: an ingredient list, not marked incomplete, analysed by
OFF, every ingredient recognised by OFF, and text in German or English (the
languages the keyword check covers). Otherwise the answer is `unknown`, and
the reason quotes what's missing (e.g. the unrecognised words). Trade-off: many
products come out `unknown`. That is the point; the app says so instead of
guessing.

**D13. "May contain" counts as `no` for allergens.**
Traces matter for allergies. Lactose-free is a diet, not the milk allergy, so
traces don't affect it.

**D14. Labels lift doubt but never override evidence.**
A "vegan" or "lactose-free" label on the pack can turn OFF's own "maybe" into
`fine`, but never turns a found ingredient into `fine`, and never replaces a
missing ingredient list.

**D15. No halal/kosher option.**
Those depend on slaughter and certification, which an ingredient list can't
show. "No pork" is offered instead; gelatine or meat of unstated origin gives
`unknown`.

## Phases 3–5: app, offline, UI

**D16. No framework, no build step.**
Plain ES modules served as they are. The app is five views and one form; a
framework would add a build and dependencies to keep up to date for nothing.
Tests use Node's built-in runner, so `package.json` has no dependencies.

**D17. The service worker caches only the app's own files.**
Product data is never cached by the service worker: the app keeps recent scans
itself and labels a saved copy with its date when offline. That way a stale
service worker can't quietly show old ingredient data. Trade-off: `VERSION` in
`sw.js` must be bumped on every deploy.

**D18. All product text goes through `textContent`.**
Open Food Facts data is user-entered, so it's treated as untrusted: no
`innerHTML`, plus a Content-Security-Policy that allows scripts only from the
app's own address.

**D19. Look: paper and ink.**
Off-white background, near-black text, one muted colour per answer (red, ochre,
green), and thin rules instead of cards or shadows. A serif for the answer, the
system sans for reading, monospace for words quoted from the pack. System fonts
only, so there are no font downloads and no requests to Google Fonts, which is
also a privacy issue in Germany.

## Phase 6: plain-language summary and tap-to-open blocks

**D20. "In short" uses public rules, not opinions.**
Every product gets a short *Watch out / Good / Worth knowing* list, profile or not,
because most people want to know "what's good in it and what isn't".
- *Watch out*: the UK Food Standards Agency's front-of-pack "high" levels (per 100 g:
  sugar > 22.5 g, fat > 17.5 g, saturated fat > 5 g, salt > 1.5 g; half that per 100 ml
  for drinks), NOVA group 4 (ultra-processed), and the six colours that need the EU
  warning about children's activity and attention (Regulation (EC) No 1333/2008, Annex V).
- *Good*: the levels a maker needs to print a nutrition claim in the EU (Regulation
  (EC) No 1924/2006, Annex), e.g. "low sugar" ≤ 5 g per 100 g (2.5 g per 100 ml),
  "high fibre" ≥ 6 g, "high protein" ≥ 20 % of energy; plus NOVA group 1.
- *Worth knowing*: energy, sweeteners, the laxative note for sugar alcohols,
  phenylalanine (PKU), caffeine, alcohol.
A value missing in the database is never judged, so missing data can't read as "good".
Trade-off: a "good" point is a true fact, not an overall judgement (Nutella is a
"source of fibre"); the *Watch out* list sits above it for that reason.

**D21. Run-together harmless words are not a data gap.**
Volunteers often leave out commas ("Aspartam Acesulfam K"), so OFF can't recognise the
part and every check said Unknown for a plain lemonade. `PLAIN_WORDS` in `rules.js`
is a short list of words that are harmless for every allergen and diet (water, acids,
named sweeteners, "natural", citrus fruits…). A part made *only* of such words is
treated as recognised. One unknown word keeps the gap, and the keyword checks still
run on the whole text. The list leaves out starches, spices and anything that can hide
an allergen.

**D22. Tinted panels and tiles.**
Plain rules on off-white read as unfinished, so the result page uses flat tinted
panels: the answer panel and *Watch out / Good / Worth knowing* in pale red, green and
sand (darker tints in dark mode). Below them, a 2×2 grid of tiles (Nutri-Score,
ingredients, German words, additives) each shows one number and opens its details in
a panel underneath. Still no gradients, shadows or glow. Tiles are real buttons with
`aria-expanded`. "Your checks" stays open, since it explains the answer; data gaps
are shown once above it instead of under every check.

**D23. "Unknown" is now "Not sure", and it says why.**
"Unknown." alone read like a failed lookup. The answer panel now names the checks
("…can't be confirmed for vegan"), and the checks follow right under it.
Nothing is said twice: data gaps (which affect every check alike) appear once, in the
answer panel when they decide it; checks with the same answer and reasons share one
row ("Milk · Sesame"); and next to quoted pack words the database's "listed as an
allergen" line is dropped, so "Milk · Vegan" can share one quote.
Later simplified further: the answer panel itself holds one short line per outcome
("Not OK: Milk, Vegan", "Unclear: Sesame", "OK: …") with the reason under it. Items
that are fine share one "OK" line with no explanation, and the panel ends with "Checked
against your list: …", because people read "Milk / Sesame" on a lemonade as noise
unless they see it comes from their own settings.

**D24. Lecithin with a printed plant source, and plain sugar, settle OFF's "maybe".**
OFF marks lecithin as maybe-animal even when the pack says `Lecithine (Soja)`, and
plain sugar as maybe-not-vegan (bone char, a US cane-sugar issue). If those are OFF's
only doubts, vegan and vegetarian can be "fine". Lecithin without a printed source
stays "not sure"; egg lecithin (`Eilecithin`) is matched as egg. Flavourings
("Aroma") stay "not sure", because their source isn't printed.

## Phase 7: summary only

**D25. The allergy/diet answer and the profile are taken out of the app.**
In use, the profile answer (No / Not sure / Probably fine) mostly said "Not sure"
(flavourings, unrecognised words) and showed the same allergens on every product,
which read as noise. The app now shows what's good, what to watch out for and the
explained details, for everyone, with no setup. `js/verdict.js`, the allergen and
diet parts of `js/rules.js` and their tests are kept unchanged (the folder has no
version history yet, so deleting them couldn't be undone); the app no longer loads
`verdict.js`. Delete them, or wire them back in, once the project is in git.
