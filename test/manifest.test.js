// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, normalizeConfig } from '../src/config.js';
import { CONTAINER_NAME, buildContainerEnv } from '../src/container.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);

// Actions registered in index.js.
const HANDLED_ACTIONS = ['resync'];

test('every manifest action has a registered handler', () => {
  const handled = new Set(HANDLED_ACTIONS);
  for (const action of manifest.actions ?? []) {
    assert.ok(handled.has(action.key), `manifest action "${action.key}" has no handler`);
  }
});

test('declaring catalog categories requires Gladys >= 4.86.0', () => {
  // The store vocabulary itself is checked by the store validator (unknown
  // keys are dropped with a warning there) — what this test pins is the
  // coupling rule: older cores reject any unknown manifest field, so a
  // manifest declaring `categories` must not claim compatibility below the
  // first release that accepts it.
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

test('section fields are purely presentational', () => {
  const sections = manifest.config_schema.filter((f) => f.type === 'section');
  assert.ok(sections.length > 0, 'the manifest declares at least one section block');
  for (const section of sections) {
    // A section stores NO value: declaring `required`, `default` or
    // `placeholder` on it rejects the manifest, and its key must never leak
    // into the config the code manipulates.
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

test('every config key except sections has a default in DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema.filter((f) => f.type !== 'section')) {
    assert.ok(field.key in DEFAULT_CONFIG, `DEFAULT_CONFIG.${field.key} is missing`);
  }
});

test('passwords are declared as secrets', () => {
  for (const field of manifest.config_schema.filter((f) => /password/.test(f.key))) {
    assert.equal(field.type, 'secret', `${field.key} must be a secret field`);
  }
});

test('the tydom2mqtt sub-container is declared, pinned and started by the code', () => {
  const container = manifest.containers.find((c) => c.name === CONTAINER_NAME);
  assert.ok(container, `the manifest declares the "${CONTAINER_NAME}" sub-container`);
  assert.match(container.docker_image, /^ghcr\.io\/tydom2mqtt\/tydom2mqtt:\d+\.\d+\.\d+$/);
  // Credentials only exist at runtime: nothing starts before startContainer.
  assert.equal(container.start, 'manual');
  assert.equal(container.env, undefined, 'the public manifest never carries credentials');
});

test('the sub-container env never carries Gladys reserved keys', () => {
  const env = buildContainerEnv(
    normalizeConfig({ tydom_mac: 'm', tydom_password: 'p', mqtt_host: 'h', mqtt_user: 'u' }),
  );
  for (const key of Object.keys(env)) {
    assert.ok(!key.startsWith('GLADYS_'), `${key} is reserved`);
  }
});
