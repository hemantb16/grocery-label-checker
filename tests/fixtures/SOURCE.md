# Test fixtures

Unmodified responses from the Open Food Facts API v3
(`https://world.openfoodfacts.org/api/v3/product/<barcode>.json?fields=…`),
downloaded on 2026-11-18. File name = barcode.

Data © Open Food Facts contributors, https://openfoodfacts.org.
Database: Open Database License (ODbL) 1.0. Individual contents: Database Contents License (DbCL) 1.0.

They are kept as they were, including their errors, because the errors are what the tests check:
- `3017624010701`: English ingredient text stored in the German field; OFF tags only nuts.
- `4316268596299`: tagged "vegan" by OFF's analysis while the allergen list says eggs.
- `4008400402222`: traces tag written as `en:en:en:milk  en:nuts  en:soybeans`.
- `40084107`: typos in the list ("Kakaobuiter") that OFF could not recognise.
