// -----------------------------------------------------------------------------
// Tydom wire framing.
//
// Over the single WebSocket connection, Tydom speaks a home-grown pseudo-HTTP:
// every command is an HTTP/1.1 request line + headers + body sent as one
// WebSocket text frame, and every reply/push notification comes back the same
// way. This module only turns that text back and forth into logical
// (method, path, body) triples — no I/O, no socket: fully unit-testable
// (see test/frame.test.js).
//
// Mirrors the framing implemented by tydom2mqtt's TydomClient.send_message /
// MessageHandler.incoming_triage.
// -----------------------------------------------------------------------------

/**
 * Build the raw WebSocket frame payload for a command.
 * @param {object} options
 * @param {string} options.cmdPrefix - '\x02' on the mediation relay, '' on a local connection.
 * @param {string} options.method - HTTP method (GET, PUT, POST).
 * @param {string} options.path - request path, including query string.
 * @param {string} [options.body] - JSON body, empty for a GET.
 * @returns {string} the frame to send.
 * @example
 * buildCommandFrame({ cmdPrefix: '', method: 'GET', path: '/devices/data' });
 */
export function buildCommandFrame({ cmdPrefix, method, path, body = '' }) {
  const bodyBytes = Buffer.byteLength(body, 'utf8');
  return (
    `${cmdPrefix}${method} ${path} HTTP/1.1\r\n` +
    `Content-Length: ${bodyBytes}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n` +
    `Transac-Id: 0\r\n\r\n` +
    body +
    (body ? '\r\n\r\n' : '')
  );
}

/**
 * Classify + decode one incoming message into a logical (kind, payload) pair.
 * `kind` is one of:
 *   - 'config'  : response of GET /configs/file (the endpoint catalog).
 *   - 'data'    : response of GET /devices/data, OR an unsolicited
 *                 PUT /devices/data push (Tydom broadcasts state changes to
 *                 every open connection) — both carry the same JSON shape.
 *   - 'ignored' : a message type this integration has no use for (scenarios,
 *                 cmeta, cdata, html, ack of /refresh/all, /info reply...).
 *   - 'unknown' : did not match any recognized framing; logged by the caller.
 * @param {string} text - raw text of the WebSocket message.
 * @param {string} cmdPrefix - the prefix this connection uses (see buildCommandFrame).
 * @returns {{ kind: string, payload?: unknown }}
 * @example
 * parseIncomingMessage('HTTP/1.1 200 OK\r\n...', '');
 */
export function parseIncomingMessage(text, cmdPrefix) {
  const stripped = cmdPrefix && text.startsWith(cmdPrefix) ? text.slice(cmdPrefix.length) : text;
  const eol = stripped.indexOf('\r\n');
  const requestLine = eol === -1 ? stripped : stripped.slice(0, eol);

  if (stripped.includes('Uri-Origin: /refresh/all')) {
    return { kind: 'ignored' };
  }

  // Unsolicited state-change push: Tydom broadcasts it, unprompted, to every
  // open connection whenever a device value changes. Framed as a request line
  // (PUT), body is chunked-transfer-encoded.
  const isDevicesOrAreasPush =
    /^PUT \/devices\/data/.test(requestLine) ||
    /^PUT \/areas\/data/.test(requestLine) ||
    /^PUT \/devices\/\S+\/endpoints\/\S+\/cdata/.test(requestLine);
  if (isDevicesOrAreasPush) {
    return decodeBody(parseChunkedBody(stripped), 'data');
  }
  // Other POST/PUT events (scenarios, moments, hvac zone broadcasts...): not
  // consumed by this integration.
  if (/^(PUT|POST) /.test(stripped)) {
    return { kind: 'ignored' };
  }

  // A normal HTTP/1.1 response to a GET we issued: headers + Content-Length body.
  if (stripped.startsWith('HTTP/1.1')) {
    const body = parseContentLengthBody(stripped);
    return decodeBody(body, 'data');
  }

  return { kind: 'unknown' };
}

/**
 * Decode a JSON body and classify it by its shape, the same heuristic Tydom
 * clients use since the framing carries no explicit content type marker
 * usable for routing (config vs. data payloads look alike at the HTTP level).
 * @param {string} body - raw (possibly empty) JSON text.
 * @param {'data'} defaultKind - kind to report when the body parses but isn't a config payload.
 */
function decodeBody(body, defaultKind) {
  const trimmed = (body ?? '').trim();
  if (!trimmed) {
    return { kind: 'ignored' };
  }
  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { kind: 'ignored' };
  }
  if (trimmed.includes('id_catalog')) {
    return { kind: 'config', payload: parsed };
  }
  if (trimmed.includes('cmetadata') || trimmed.includes('cdata')) {
    return { kind: 'ignored' };
  }
  return { kind: defaultKind, payload: parsed };
}

/**
 * Extract the body of a plain HTTP/1.1 response using its Content-Length
 * header (Tydom never chunks a response to a GET it answers directly).
 * @param {string} text - full response text, request/status line included.
 */
function parseContentLengthBody(text) {
  const separatorIndex = text.indexOf('\r\n\r\n');
  if (separatorIndex === -1) {
    return '';
  }
  return text.slice(separatorIndex + 4);
}

/**
 * Extract the body of a chunked-transfer-encoded push message. Tydom's
 * encoder puts each chunk's size and data on their own line, so — like
 * tydom2mqtt — this walks (size-line, data-line) pairs after the header
 * block and concatenates the data lines until the terminating 0-size chunk.
 * @param {string} text - full request text, request line included.
 */
function parseChunkedBody(text) {
  const separatorIndex = text.indexOf('\r\n\r\n');
  if (separatorIndex === -1) {
    return '';
  }
  const lines = text.slice(separatorIndex + 4).split('\r\n');
  let output = '';
  for (let i = 0; i < lines.length; i += 2) {
    const line = lines[i];
    if (line === undefined || line.length === 0 || line === '0') {
      break;
    }
    output += lines[i + 1] !== undefined ? lines[i + 1] : '';
  }
  return output;
}
