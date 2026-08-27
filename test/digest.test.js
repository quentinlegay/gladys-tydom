import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDigestHeader, parseChallenge } from '../src/tydom/digest.js';

// Interop vector: same inputs run through Python's `requests.auth.HTTPDigestAuth`
// (the library tydom2mqtt itself uses to talk to a real Tydom box), nonce count
// and cnonce copied verbatim from its output so this only re-checks the hash
// math, not the (intentionally random) cnonce generation. Regenerate by running
// TydomClient.build_digest_headers-equivalent Python with these exact inputs if
// this ever needs re-deriving.
const TYDOM_VECTOR = {
  method: 'GET',
  uri: '/mediation/client?mac=001A2B3C4D5E&appli=1',
  username: '001A2B3C4D5E',
  password: 'sup3rSecret',
  realm: 'ServiceMedia',
  nonce: 'dcd98b7102dd2f0e8b11d0f600bbdc7c',
  cnonce: '2fd0e7947372fa97',
  nc: '00000002',
};
const TYDOM_EXPECTED_RESPONSE = '34f8b6ed8a5fa8c7be5bd748a7afdb02';

test('buildDigestHeader matches requests.auth.HTTPDigestAuth (tydom2mqtt) for the same inputs', () => {
  const header = buildDigestHeader(TYDOM_VECTOR);
  assert.match(header, new RegExp(`response="${TYDOM_EXPECTED_RESPONSE}"`));
  assert.match(header, /username="001A2B3C4D5E"/);
  assert.match(header, /realm="ServiceMedia"/);
  assert.match(header, /nonce="dcd98b7102dd2f0e8b11d0f600bbdc7c"/);
  assert.match(header, /uri="\/mediation\/client\?mac=001A2B3C4D5E&appli=1"/);
  assert.match(header, /qop=auth/);
  assert.match(header, /nc=00000002/);
  assert.match(header, /cnonce="2fd0e7947372fa97"/);
});

// The `uri` fed into the digest math must be the request-uri (path + query)
// alone: HTTPDigestAuth re-derives it from the absolute URL via urlparse
// before hashing, so passing the full "https://host:443/path" here — an easy
// mistake — would produce a response the box silently rejects.
test('buildDigestHeader rejects the absolute URL as `uri` (path+query only is correct)', () => {
  const withAbsoluteUri = buildDigestHeader({
    ...TYDOM_VECTOR,
    uri: `https://mediation.tydom.com:443${TYDOM_VECTOR.uri}`,
  });
  assert.doesNotMatch(withAbsoluteUri, new RegExp(`response="${TYDOM_EXPECTED_RESPONSE}"`));
});

test('buildDigestHeader generates a random cnonce when none is given', () => {
  const a = buildDigestHeader({ ...TYDOM_VECTOR, cnonce: undefined });
  const b = buildDigestHeader({ ...TYDOM_VECTOR, cnonce: undefined });
  assert.notEqual(a, b, 'two calls without a fixed cnonce must not collide');
});

test('parseChallenge extracts the realm and nonce from a WWW-Authenticate header', () => {
  const header =
    'Digest realm="ServiceMedia", qop="auth", nonce="dcd98b7102dd2f0e8b11d0f600bbdc7c", opaque="xyz"';
  assert.deepEqual(parseChallenge(header), {
    realm: 'ServiceMedia',
    nonce: 'dcd98b7102dd2f0e8b11d0f600bbdc7c',
  });
});

// Real-world regression: a box was observed advertising "Protected Area"
// (title case) while every reference implementation assumed a hardcoded
// lowercase "protected area" — parseChallenge must return the byte-for-byte
// value the box sent, not normalize or guess it, since HA1 = MD5(username:
// realm:password) has to match the server's own computation exactly.
test('parseChallenge preserves the realm exactly as advertised (no case normalization)', () => {
  const header = 'Digest realm="Protected Area", qop="auth", nonce="abc123", opaque="xyz"';
  assert.equal(parseChallenge(header).realm, 'Protected Area');
});

test('parseChallenge returns undefined when there is no header or no nonce', () => {
  assert.equal(parseChallenge(undefined), undefined);
  assert.equal(parseChallenge(''), undefined);
  assert.equal(parseChallenge('Digest realm="ServiceMedia", qop="auth"'), undefined);
});
