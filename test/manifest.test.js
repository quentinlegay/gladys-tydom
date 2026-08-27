// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG } from '../src/config.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const indexSource = await readFile(new URL('../index.js', import.meta.url), 'utf8');

test('every manifest action has a registered onAction handler in index.js', () => {
  for (const action of manifest.actions ?? []) {
    assert.match(
      indexSource,
      new RegExp(`onAction\\(['"]${action.key}['"]`),
      `manifest action "${action.key}" has no gladys.onAction handler`,
    );
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  assert.ok(manifest.categories.length >= 1 && manifest.categories.length <= 3);
  const minVersion = manifest.gladys_version.match(/>=\s*(\d+)\.(\d+)\.\d+/);
  assert.ok(minVersion, 'gladys_version must declare a minimum version');
  const [, major, minor] = minVersion.map(Number);
  assert.ok(
    major > 4 || (major === 4 && minor >= 86),
    `categories requires gladys_version >= 4.86.0, got "${manifest.gladys_version}"`,
  );
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.default !== undefined) {
      assert.equal(
        DEFAULT_CONFIG[field.key],
        field.default,
        `DEFAULT_CONFIG.${field.key} must match the manifest default`,
      );
    }
  }
});

test('every non-section config_schema key has a slot in DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'section') {
      continue;
    }
    assert.ok(
      field.key in DEFAULT_CONFIG,
      `config_schema key "${field.key}" is missing from DEFAULT_CONFIG`,
    );
  }
});

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0);
  for (const section of sections) {
    assert.equal(section.required, undefined, `section "${section.key}" must not be required`);
    assert.equal(section.default, undefined, `section "${section.key}" must not have a default`);
    assert.equal(
      section.placeholder,
      undefined,
      `section "${section.key}" must not have a placeholder`,
    );
    assert.ok(section.label?.en, `section "${section.key}" needs an English label`);
    assert.ok(
      !(section.key in DEFAULT_CONFIG),
      `section "${section.key}" stores no value and must not appear in DEFAULT_CONFIG`,
    );
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//, 'section links must be https');
    }
  }
});

test('secret fields never declare a default (the host API would reject it)', () => {
  for (const field of manifest.config_schema) {
    if (field.type === 'secret') {
      assert.equal(field.default, undefined, `secret field "${field.key}" must not have a default`);
    }
  }
});

test('config_schema keys are unique', () => {
  const keys = manifest.config_schema.map((f) => f.key);
  assert.equal(new Set(keys).size, keys.length);
});

test('the manifest declares both transports, matching the local/cloud Tydom connection modes', () => {
  assert.deepEqual([...manifest.transports].sort(), ['cloud', 'local']);
});
