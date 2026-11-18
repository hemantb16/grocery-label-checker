import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explainAdditive, germanTerms } from '../js/explain.js';

test('additive lookup falls back from sub-variant to base number', () => {
  assert.equal(explainAdditive('e322i').name, 'Lecithins');
  assert.equal(explainAdditive('e150d').name, 'Sulphite ammonia caramel');
  assert.equal(explainAdditive('e120').animal, true);
  assert.equal(explainAdditive('e9999').name, null);
});

test('German terms are found in reading order without nested duplicates', () => {
  const t = germanTerms('Zucker, MAGERMILCHPULVER, natürliches Aroma, Milchsäure');
  assert.deepEqual(t.map((x) => x.de), ['zucker', 'magermilchpulver', 'natürliches aroma', 'milchsäure']);
  assert.equal(t[1].word, 'MAGERMILCHPULVER');
});
