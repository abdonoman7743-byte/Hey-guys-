import test from 'node:test';
import assert from 'node:assert/strict';
import { translations } from './translations';

test('English and Arabic translation dictionaries have identical keys and non-empty strings', () => {
  const enKeys = Object.keys(translations.en).sort();
  const arKeys = Object.keys(translations.ar).sort();
  assert.deepEqual(enKeys, arKeys);

  for (const key of enKeys) {
    const k = key as keyof typeof translations.en;
    assert.ok(translations.en[k].trim().length > 0, `Empty en translation for ${key}`);
    assert.ok(translations.ar[k].trim().length > 0, `Empty ar translation for ${key}`);
  }
});
