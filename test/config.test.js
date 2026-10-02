import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, missingConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig cleans the MAC address', () => {
  assert.equal(normalizeConfig({ tydom_mac: ' 00:1a:25:12:34:56 ' }).tydom_mac, '001A25123456');
});

test('normalizeConfig coerces numeric strings coming from a form', () => {
  const config = normalizeConfig({ mqtt_port: '1884', tydom_polling_interval: '600' });
  assert.equal(config.mqtt_port, 1884);
  assert.equal(config.tydom_polling_interval, 600);
});

test('an empty Tydom IP falls back to the Delta Dore cloud', () => {
  assert.equal(normalizeConfig({ tydom_ip: ' ' }).tydom_ip, 'mediation.tydom.com');
});

test('manage_container defaults to true and only an explicit false disables it', () => {
  assert.equal(normalizeConfig().manage_container, true);
  assert.equal(normalizeConfig({ manage_container: false }).manage_container, false);
});

test('missingConfig explains what is missing', () => {
  assert.match(missingConfig(normalizeConfig()).en, /MQTT/);
  assert.match(missingConfig(normalizeConfig({ mqtt_host: 'h' })).en, /MAC/);
  assert.match(missingConfig(normalizeConfig({ mqtt_host: 'h', tydom_mac: 'm' })).en, /password/);
  assert.equal(
    missingConfig(normalizeConfig({ mqtt_host: 'h', tydom_mac: 'm', tydom_password: 'p' })),
    null,
  );
  assert.equal(
    missingConfig(
      normalizeConfig({
        mqtt_host: 'h',
        tydom_mac: 'm',
        deltadore_login: 'a@b.c',
        deltadore_password: 'p',
      }),
    ),
    null,
  );
  // tydom2mqtt run by the user: only the broker matters.
  assert.equal(missingConfig(normalizeConfig({ mqtt_host: 'h', manage_container: false })), null);
});
