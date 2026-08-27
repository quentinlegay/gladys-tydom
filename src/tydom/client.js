// -----------------------------------------------------------------------------
// Low-level Tydom protocol client: one WebSocket connection, Digest-challenged
// on open, speaking the pseudo-HTTP framing of src/tydom/frame.js.
//
// This is the ONLY module that touches the network. It emits 'config' and
// 'data' for every parsed payload (see src/tydom/frame.js#parseIncomingMessage)
// and 'disconnected' / 'error' for the connection lifecycle. It knows nothing
// about Gladys or the device registry — src/tydom/service.js wires those.
//
// Local vs. mediation mode (mirrors tydom2mqtt's TydomClient): connecting to
// the Delta Dore mediation relay (no `host` given) uses the '\x02' command
// prefix; connecting directly to the box on the LAN (a `host` IP given) uses
// no prefix. Both complete the Digest handshake when the box challenges it,
// using the realm THE BOX ITSELF advertised (see #fetchChallenge/connect) —
// some local boxes don't challenge at all, which is why the probe degrades
// to an unauthenticated connection instead of failing outright.
// -----------------------------------------------------------------------------

import { EventEmitter } from 'node:events';
import https from 'node:https';
import { constants as cryptoConstants, randomBytes } from 'node:crypto';
import WebSocket from 'ws';
import { createLogger } from '@gladysassistant/integration-sdk';
import { buildDigestHeader, parseChallenge } from './digest.js';
import { buildCommandFrame, parseIncomingMessage } from './frame.js';
import { MEDIATION_URL } from './const.js';

const logger = createLogger({ name: 'tydom:client' });

// Tydom boxes are old embedded devices whose TLS stack still uses legacy
// session renegotiation; OpenSSL 3.x (Node 18+) refuses it by default and
// fails the handshake with "unsafe legacy renegotiation disabled". This
// option re-allows it — required for EVERY TLS connection to a Tydom box,
// local or through the mediation relay, both the throwaway nonce probe and
// the WebSocket upgrade below.
//
// SSL_OP_LEGACY_SERVER_CONNECT (0x4) is the second, DISTINCT half of this:
// tydom2mqtt's own TydomClient sets exactly this flag (`ssl_context.options
// |= 0x4`), and only for a LOCAL connection — it permits the INITIAL
// handshake with a server that does not support RFC 5746 secure
// renegotiation at all, as opposed to ALLOW_UNSAFE_LEGACY_RENEGOTIATION
// above which only covers a RE-negotiation on an already-established
// session. Without it, a local box's embedded TLS stack can complete the
// handshake and accept the WebSocket upgrade, then cleanly close the
// session (WS code 1000) moments later. Applied unconditionally (mediation
// relay included) since it only widens compatibility, never restricts it.
const secureOptions =
  cryptoConstants.SSL_OP_ALLOW_UNSAFE_LEGACY_RENEGOTIATION |
  cryptoConstants.SSL_OP_LEGACY_SERVER_CONNECT;

export class TydomClient extends EventEmitter {
  /**
   * @param {object} options
   * @param {string} options.mac - Tydom gateway mac (also the Digest username).
   * @param {string} options.password - Tydom gateway password.
   * @param {string} [options.host] - local IP of the box; the mediation relay otherwise.
   */
  constructor({ mac, password, host }) {
    super();
    this.mac = mac;
    this.password = password;
    this.host = host && host.trim() ? host.trim() : MEDIATION_URL;
    this.remoteMode = this.host === MEDIATION_URL;
    this.cmdPrefix = this.remoteMode ? '\x02' : '';
    this.ws = null;
  }

  get path() {
    return `/mediation/client?mac=${encodeURIComponent(this.mac)}&appli=1`;
  }

  /** Open the connection: Digest probe, then the WebSocket upgrade. */
  async connect() {
    const challenge = await this.#fetchChallenge();
    const headers = {};
    if (challenge) {
      // Use the realm the box ITSELF advertised, never a guessed constant:
      // HA1 = MD5(username:realm:password) per RFC 2617, so a client-side
      // realm that does not byte-for-byte match the server's own value
      // (different Tydom firmwares have been seen advertising "Protected
      // Area" vs. the commonly assumed "protected area") computes a
      // response the box's own math never matches — the WebSocket upgrade
      // still succeeds (it isn't gated on auth), but the box then silently
      // closes the session moments later once it finds the client was never
      // really authenticated. The realm fallback below only covers the
      // theoretical case of a challenge with a nonce but no realm= field.
      const realm = challenge.realm ?? (this.remoteMode ? 'ServiceMedia' : 'protected area');
      logger.info(
        `Digest challenge received from Tydom (${this.host}), realm="${realm}": authenticating`,
      );
      headers.Authorization = buildDigestHeader({
        method: 'GET',
        // The digest `uri` is the request-uri only (path + query), never the
        // absolute URL — matching what tydom2mqtt's `requests.auth.HTTPDigestAuth`
        // computes internally (it re-derives it from the URL via urlparse).
        // Using the absolute URL here would produce a response the box rejects.
        uri: this.path,
        username: this.mac,
        password: this.password,
        realm,
        nonce: challenge.nonce,
      });
    } else {
      // Deliberately at info level (not debug): whether the box actually
      // challenges local connections is exactly what needs to be visible
      // while diagnosing an immediate post-connect close — this is a
      // once-per-connection-attempt line, not a spammy one.
      logger.info(
        `No Digest challenge received from Tydom (${this.host}): connecting without authentication`,
      );
    }

    await new Promise((resolve, reject) => {
      const ws = new WebSocket(`wss://${this.host}:443${this.path}`, {
        headers,
        // Tydom boxes use a self-signed certificate, both locally and
        // through the mediation relay: this is the expected trust model, not
        // a shortcut (the connection is still authenticated by the Digest
        // credentials above and, once connected, by the mac/password pair).
        rejectUnauthorized: false,
        secureOptions,
        handshakeTimeout: 15_000,
      });
      const onError = (err) => {
        ws.removeListener('open', onOpen);
        reject(err);
      };
      const onOpen = () => {
        ws.removeListener('error', onError);
        this.ws = ws;
        this.#wire(ws);
        resolve();
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
    });
  }

  #wire(ws) {
    ws.on('message', (data) => {
      const text = data.toString('utf8');
      let message;
      try {
        message = parseIncomingMessage(text, this.cmdPrefix);
      } catch (err) {
        logger.warn('Failed to parse an incoming Tydom message', err);
        return;
      }
      if (message.kind === 'config' || message.kind === 'data') {
        this.emit(message.kind, message.payload);
      } else if (message.kind === 'unknown') {
        logger.debug('Unrecognized Tydom message:', text.slice(0, 120));
      }
    });
    ws.on('close', (code, reason) => {
      this.ws = null;
      this.emit('disconnected', { code, reason: reason?.toString() });
    });
    ws.on('error', (err) => {
      this.emit('error', err);
    });
  }

  /** Close the connection; no further events are emitted afterwards. */
  disconnect() {
    if (this.ws) {
      const ws = this.ws;
      this.ws = null;
      ws.removeAllListeners();
      ws.terminate();
    }
  }

  get connected() {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  async send(method, path, body = '') {
    if (!this.connected) {
      throw new Error('Cannot send a Tydom command: not connected');
    }
    this.ws.send(buildCommandFrame({ cmdPrefix: this.cmdPrefix, method, path, body }));
  }

  /** Command a device endpoint: PUT /devices/{id}/endpoints/{id}/data. */
  async putDeviceData(deviceId, endpointId, name, value) {
    const body = JSON.stringify([{ name, value: String(value) }]);
    await this.send('PUT', `/devices/${deviceId}/endpoints/${endpointId}/data`, body);
  }

  /** Ask for the endpoint catalog; answered asynchronously as a 'config' event. */
  async getConfigsFile() {
    await this.send('GET', '/configs/file');
  }

  /** Ask for the current state of every device; answered as a 'data' event. */
  async getDevicesData() {
    await this.send('GET', '/devices/data');
  }

  /** Ask the box to re-broadcast the state of everything (periodic drift-correction). */
  async postRefreshAll() {
    await this.send('POST', '/refresh/all');
  }

  /**
   * Probe for a Digest challenge with a throwaway HTTPS request (mirrors the
   * preliminary GET tydom2mqtt performs before the WebSocket upgrade). A box
   * that requires no local authentication answers without a WWW-Authenticate
   * header — resolved as `undefined`, and `connect()` proceeds unauthenticated
   * rather than failing.
   *
   * The request headers deliberately shape this as a real WebSocket-upgrade
   * attempt (Sec-WebSocket-Key/Version, Accept), not just a bare GET with
   * Connection/Upgrade: some Tydom firmware only returns the Digest
   * challenge on a request it recognizes as one — a bare GET can get silently
   * treated as anonymous, and the box then drops the *later* WebSocket
   * connection outright (no clean close frame) once it realizes the session
   * was never authenticated.
   * @returns {Promise<{realm: string, nonce: string}|undefined>}
   */
  #fetchChallenge() {
    return new Promise((resolve) => {
      const req = https.request(
        {
          host: this.host,
          port: 443,
          path: this.path,
          method: 'GET',
          rejectUnauthorized: false,
          secureOptions,
          headers: {
            Connection: 'Upgrade',
            Upgrade: 'websocket',
            Accept: '*/*',
            'Sec-WebSocket-Key': randomBytes(16).toString('base64'),
            'Sec-WebSocket-Version': '13',
          },
          timeout: 10_000,
        },
        (res) => {
          res.resume(); // drain the body, only the header is needed
          res.on('end', () => {
            logger.info(
              `Digest probe response from Tydom (${this.host}): status=${res.statusCode}, ` +
                `www-authenticate=${res.headers['www-authenticate'] ? `"${res.headers['www-authenticate']}"` : '<absent>'}`,
            );
            resolve(parseChallenge(res.headers['www-authenticate']));
          });
        },
      );
      req.on('timeout', () => req.destroy());
      req.on('error', (err) => {
        logger.info(
          `Digest nonce probe to Tydom (${this.host}) failed, will try an unauthenticated connection: ${err.message}`,
        );
        resolve(undefined);
      });
      req.end();
    });
  }
}
