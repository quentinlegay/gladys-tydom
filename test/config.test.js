import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, DEFAULT_CONFIG } from '../src/config.js';

test('normalizeConfig returns the defaults when called with no argument', () => {
  assert.deepEqual(normalizeConfig(), DEFAULT_CONFIG);
});

test('normalizeConfig strips separators and uppercases the mac address', () => {
  assert.equal(normalizeConfig({ tydom_mac: '00:1a:2b:3c:4d:5e' }).tydom_mac, '001A2B3C4D5E');
  assert.equal(normalizeConfig({ tydom_mac: '00-1A-2B-3C-4D-5E' }).tydom_mac, '001A2B3C4D5E');
  assert.equal(normalizeConfig({ tydom_mac: ' 001a2b3c4d5e ' }).tydom_mac, '001A2B3C4D5E');
});

test('normalizeConfig coerces poll_frequency coming from a form as a string', () => {
  const config = normalizeConfig({ poll_frequency: '600' });
  assert.equal(config.poll_frequency, 600);
  assert.equal(typeof config.poll_frequency, 'number');
});

test('normalizeConfig falls back to the default poll_frequency when missing', () => {
  assert.equal(
    normalizeConfig({ tydom_mac: '001A2B3C4D5E' }).poll_frequency,
    DEFAULT_CONFIG.poll_frequency,
  );
});

test('normalizeConfig trims the local host and Delta Dore login', () => {
  const config = normalizeConfig({
    tydom_host: ' 192.168.1.42 ',
    deltadore_login: ' user@example.com ',
  });
  assert.equal(config.tydom_host, '192.168.1.42');
  assert.equal(config.deltadore_login, 'user@example.com');
});

test('GLADYS_PREFER_LOCAL defaults to true and only an explicit false disables it', () => {
  assert.equal(normalizeConfig().GLADYS_PREFER_LOCAL, true);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: true }).GLADYS_PREFER_LOCAL, true);
  assert.equal(normalizeConfig({ GLADYS_PREFER_LOCAL: false }).GLADYS_PREFER_LOCAL, false);
});
