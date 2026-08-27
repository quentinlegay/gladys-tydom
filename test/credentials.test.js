import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchGatewayPassword } from '../src/tydom/credentials.js';

function withStubbedFetch(responses, run) {
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    const next = responses.shift();
    if (!next) {
      throw new Error(`Unexpected extra fetch call to ${url}`);
    }
    return next;
  };
  return run(calls).finally(() => {
    globalThis.fetch = realFetch;
  });
}

function jsonResponse(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

test('fetchGatewayPassword walks discovery -> token -> sites and returns the gateway password', async () => {
  const responses = [
    jsonResponse({ token_endpoint: 'https://auth.example/token' }),
    jsonResponse({ access_token: 'abc123' }),
    jsonResponse({ sites: [{ gateway: { password: 'sup3rSecret' } }] }),
  ];

  await withStubbedFetch(responses, async (calls) => {
    const password = await fetchGatewayPassword('user@example.com', 'hunter2', '001A2B3C4D5E');
    assert.equal(password, 'sup3rSecret');
    assert.equal(calls.length, 3);
    assert.match(calls[0].url, /well-known\/openid-configuration/);
    assert.equal(calls[1].url, 'https://auth.example/token');
    assert.match(calls[2].url, /gateway_mac=001A2B3C4D5E/);
    assert.equal(calls[2].options.headers.Authorization, 'Bearer abc123');
  });
});

test('fetchGatewayPassword throws when the Delta Dore account sign-in is refused', async () => {
  const responses = [
    jsonResponse({ token_endpoint: 'https://auth.example/token' }),
    jsonResponse({ error_description: 'invalid_grant' }, false, 400),
  ];
  await withStubbedFetch(responses, async () => {
    await assert.rejects(
      () => fetchGatewayPassword('user@example.com', 'wrong', '001A2B3C4D5E'),
      /refused/,
    );
  });
});

test('fetchGatewayPassword throws when the mac matches no site', async () => {
  const responses = [
    jsonResponse({ token_endpoint: 'https://auth.example/token' }),
    jsonResponse({ access_token: 'abc123' }),
    jsonResponse({ sites: [] }),
  ];
  await withStubbedFetch(responses, async () => {
    await assert.rejects(
      () => fetchGatewayPassword('user@example.com', 'hunter2', 'FFFFFFFFFFFF'),
      /No Tydom site/,
    );
  });
});
