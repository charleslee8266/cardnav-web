import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { getModelFamilyIcon, defaultModelIcon } from '../src/models/family-icons.js';

const assetRoot = path.resolve('public/assets/model-family-icons');
const sources = JSON.parse(fs.readFileSync(path.join(assetRoot, 'sources.json'), 'utf8'));
test('documented family marks resolve to their licensed local asset without name inference', () => {
  for (const entry of Object.values(sources.icons) as {familyNames?: string[]; file: string; license?: string}[]) {
    for (const family of entry.familyNames || []) {
      const icon = getModelFamilyIcon(family);
      assert.notEqual(icon.path, defaultModelIcon.path, family);
      assert.equal(path.resolve('public', `.${icon.path}`), path.resolve(assetRoot, entry.file), family);
      assert.ok(fs.statSync(path.resolve('public', `.${icon.path}`)).size > 0, family);
      assert.ok(entry.license, family);
    }
  }
});
test('unverified identities use the neutral mark instead of guessing a brand', () => {
  for (const name of ['unverified-custom-model', 'Seedance', 'Seedream', 'Jev']) {
    assert.equal(getModelFamilyIcon(name), defaultModelIcon);
  }
  assert.notEqual(getModelFamilyIcon('GPT Image'), defaultModelIcon);
});
