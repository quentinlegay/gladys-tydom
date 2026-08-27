// -----------------------------------------------------------------------------
// HTTP Digest Access Authentication (RFC 2617, qop="auth", algorithm MD5).
//
// The Tydom box challenges the initial HTTPS handshake with a 401 carrying a
// WWW-Authenticate header; this module extracts its nonce and builds the
// Authorization header sent back — both for the throwaway HTTPS probe and for
// the WebSocket upgrade that follows (see src/tydom/client.js).
//
// Pure string/hash logic, no I/O: fully unit-testable against the classic
// RFC 2617 example vector (see test/digest.test.js).
// -----------------------------------------------------------------------------

import { createHash, randomBytes } from 'node:crypto';

function md5(value) {
  return createHash('md5').update(value, 'utf8').digest('hex');
}

/**
 * Extract the `realm` and `nonce` from a WWW-Authenticate header value.
 * Per RFC 2617, HA1 = MD5(username:realm:password) MUST use the realm the
 * server itself advertised — different Tydom boxes/firmwares have been seen
 * advertising different casings (e.g. "Protected Area" vs. the commonly
 * assumed "protected area"); a client that substitutes its own guessed
 * constant computes a response the box's own math never matches, so the
 * connection is silently rejected right after the handshake instead of
 * failing loudly.
 * @param {string} headerValue - raw WWW-Authenticate header value.
 * @returns {{ realm: string, nonce: string }|undefined} the challenge, or
 *   undefined if there is no header or it carries no nonce.
 */
export function parseChallenge(headerValue) {
  if (!headerValue) {
    return undefined;
  }
  const nonceMatch = /nonce="([^"]*)"/.exec(headerValue);
  if (!nonceMatch) {
    return undefined;
  }
  const realmMatch = /realm="([^"]*)"/.exec(headerValue);
  return { realm: realmMatch ? realmMatch[1] : undefined, nonce: nonceMatch[1] };
}

/**
 * Build the value of an Authorization: Digest header.
 * @param {object} options
 * @param {string} options.method - HTTP method of the request being authorized.
 * @param {string} options.uri - request-uri, exactly as sent on the request line.
 * @param {string} options.username
 * @param {string} options.password
 * @param {string} options.realm
 * @param {string} options.nonce
 * @param {string} [options.cnonce] - client nonce; random 8 bytes hex if omitted.
 * @param {string} [options.nc] - nonce count; "00000001" if omitted (single request per nonce).
 * @returns {string} the ready-to-send header value.
 * @example
 * buildDigestHeader({ method: 'GET', uri: '/x', username: 'mac', password: 'pwd', realm: 'ServiceMedia', nonce: 'abc' });
 */
export function buildDigestHeader({
  method,
  uri,
  username,
  password,
  realm,
  nonce,
  cnonce,
  nc = '00000001',
}) {
  const qop = 'auth';
  const clientNonce = cnonce ?? randomBytes(8).toString('hex');
  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`${method}:${uri}`);
  const response = md5(`${ha1}:${nonce}:${nc}:${clientNonce}:${qop}:${ha2}`);

  return (
    `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `qop=${qop}, nc=${nc}, cnonce="${clientNonce}", response="${response}"`
  );
}
