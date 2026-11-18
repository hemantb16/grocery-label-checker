# Label Check

Scan a food barcode with your phone and see, in plain words, **what's good in
it and what to watch out for**.

The app looks the product up in [Open Food Facts](https://openfoodfacts.org) and
shows three short lists: **Watch out** (high sugar, fat or salt, ultra-processed,
colours with an EU warning), **Good** (no sugar, high fibre, high protein…) and
**Worth knowing** (calories, sweeteners, caffeine, phenylalanine). Below them, tap a
box to see the Nutri-Score, the ingredient list, German ingredient words explained in
English, and what each E-number is. That helps if you are new to shopping in Germany.

It is a static web app (PWA). It installs to the home screen and needs no account.

> Product data is entered by volunteers and can be wrong or out of date.
> This app is a second look, not a guarantee and not medical advice.
> For allergies, always read the allergens printed in bold on the pack.

## How the summary is worked out


[`js/summary.js`](js/summary.js) uses published thresholds, never its own opinion:

| List | Rule | Source |
|---|---|---|
| Watch out | "High" sugar, fat, saturated fat, salt (per 100 g; half for drinks per 100 ml) | UK Food Standards Agency front-of-pack labelling guidance |
| Watch out | Ultra-processed | NOVA group 4, as computed by Open Food Facts |
| Watch out | E102, E104, E110, E122, E124, E129 | EU Regulation (EC) No 1333/2008, Annex V (children's attention warning) |
| Good | No / low sugar, fat, salt; source of / high in fibre and protein; low calories | EU Regulation (EC) No 1924/2006, Annex (nutrition claims) |
| Worth knowing | Sweeteners, sugar alcohols, phenylalanine, caffeine, alcohol | Additives and ingredient text |

A value the database doesn't have is never judged, so missing data never shows up as "Good".

More reasoning and trade-offs: [DECISIONS.md](DECISIONS.md).

## Run it locally

You need Node.js 20 or newer (built and tested with 24). There are no dependencies to install and no build step.

```bash
npm start
```

Then open http://localhost:8090. Browsers allow the camera and the service
worker on `localhost` without HTTPS. To try it on your phone, deploy it (below);
phones only allow the camera on HTTPS.

Run the tests (Node's built-in test runner):

```bash
npm test
```

After changing any app file, bump `VERSION` in [`sw.js`](sw.js). The service
worker serves the cached app first, so without a new version installed copies
keep the old files.

## Deploy to GitHub Pages (free)

1. Push the repository to GitHub.
2. On GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch**,
   branch `main`, folder `/ (root)`, **Save**.
3. After a minute the app is at `https://<user>.github.io/grocery-label-checker/`.
   All paths are relative, so it works from that sub-folder as is.
4. On the phone, open that address. Android Chrome: menu → **Add to Home screen**.
   iPhone Safari: Share → **Add to Home Screen**.

## Project layout

```
index.html              the page: all views, Content-Security-Policy
style.css               paper-and-ink styling, light and dark
js/app.js               views, routing, storage, rendering
js/verdict.js           allergy/diet checks (not used by the app since 1.2; see below)
js/summary.js           plain-language summary: watch out / good / worth knowing
js/rules.js             keyword groups for allergens and diets; language names
js/off.js               Open Food Facts client and data normaliser
js/explain.js           E-number notes and German ingredient glossary
js/scan.js              camera scanning: BarcodeDetector, else ZXing
sw.js                   service worker: caches the app shell for offline use
manifest.webmanifest    install metadata
vendor/                 ZXing, vendored at a pinned version
scripts/serve.mjs       local static server (no dependencies)
scripts/make-icons.mjs  writes the SVG and PNG icons
tests/                  unit tests and real API fixtures
```

## Data source and API use

Checked on 2026-11-18 against the
[Open Food Facts API documentation](https://openfoodfacts.github.io/openfoodfacts-server/api/)
and [terms of use](https://world.openfoodfacts.org/terms-of-use).

- **Endpoint:** API v3, `GET /api/v3/product/{barcode}.json` with `fields=` so
  only the needed fields are sent. v3 is the version the docs recommend; v2 is
  deprecated. Reading needs no account or key.
- **Rate limit:** 15 product reads per minute per IP. Requests come from each
  user's own phone, and a product looked up in the last 10 minutes is shown from
  the phone's recent list without asking again.
- **Identification:** Open Food Facts asks every client to identify itself
  (`AppName/Version (contact)`) in the `User-Agent` header. Browsers don't let a
  page set that header, and the docs have no browser-specific advice. The API's
  CORS settings allow an `X-User-Agent` header, so the app sends
  `X-User-Agent: GroceryLabelChecker/1.1.0 (https://github.com/hemantb16/grocery-label-checker)`.
- **No product photos.** Photos are CC BY-SA 3.0 and need per-image credit, and
  packaging can carry trademark and design rights. Each result links to the
  product's page on Open Food Facts instead.

## Licences

App code and the written explanations: MIT (see [`LICENSE`](LICENSE)).

| What | Licence | Notes |
|---|---|---|
| Open Food Facts database | [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/) | Credited with a link on every result and on the About screen. The app shows single records and builds no derived database, so share-alike doesn't come into play. |
| Individual product data | [DbCL 1.0](https://opendatacommons.org/licenses/dbcl/1-0/) | Same credit. Also covers the API responses kept in `tests/fixtures/` (see `SOURCE.md` there). |
| Product photos | CC BY-SA 3.0 | Not used. |
| [`@zxing/library`](https://github.com/zxing-js/library) 0.23.0 | Apache-2.0 | `vendor/zxing-library-0.23.0/`, licence file included. Taken from the npm tarball; sha512 matched the registry. Used unmodified. |
| E-number notes and German glossary (`js/explain.js`) | MIT | Written for this project. Not copied from Open Food Facts' taxonomy or Wikipedia. |

Fonts are the phone's own system fonts. No web fonts, CDN or analytics, so
the page makes no third-party requests apart from the Open Food Facts lookup.

## Privacy

- Recent scans are stored only in the browser's `localStorage`.
- The only data sent anywhere is the barcode, to Open Food Facts, which sees the
  phone's IP address as any website would.
- A Content-Security-Policy in `index.html` only allows connections to the
  app's own address and `world.openfoodfacts.org`.

## Known limits

- The app doesn't check allergies or diets. An earlier version had a profile and a
  No / Not sure / Probably fine answer; it was taken out of the app in 1.2 because
  missing data made most answers "Not sure". The tested logic is still in
  `js/verdict.js` and `js/rules.js` (see DECISIONS.md D25) if it's wanted back.
- The German-word glossary and E-number notes cover common words, not all of them.
- A "Good" point is a true fact, not an overall verdict: a sweet spread can still be
  a "source of fibre". The *Watch out* list is shown first for that reason.
- Live camera scanning has to be tried on a real phone. The ZXing decoding
  was checked in a browser against drawn EAN-13 barcodes, and the blocked-camera
  path was checked too, but no camera was available while building this.
