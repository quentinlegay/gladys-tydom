import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCommandFrame, parseIncomingMessage } from '../src/tydom/frame.js';

test('buildCommandFrame frames a bodyless GET exactly like Tydom expects', () => {
  const frame = buildCommandFrame({ cmdPrefix: '', method: 'GET', path: '/devices/data' });
  assert.equal(
    frame,
    'GET /devices/data HTTP/1.1\r\nContent-Length: 0\r\nContent-Type: application/json; charset=UTF-8\r\nTransac-Id: 0\r\n\r\n',
  );
});

test('buildCommandFrame frames a PUT with a JSON body and the mediation cmd prefix', () => {
  const body = '[{"name":"position","value":"70"}]';
  const frame = buildCommandFrame({
    cmdPrefix: '\x02',
    method: 'PUT',
    path: '/devices/1/endpoints/10/data',
    body,
  });
  const expectedLength = Buffer.byteLength(body, 'utf8');
  assert.equal(
    frame,
    `\x02PUT /devices/1/endpoints/10/data HTTP/1.1\r\nContent-Length: ${expectedLength}\r\nContent-Type: application/json; charset=UTF-8\r\nTransac-Id: 0\r\n\r\n${body}\r\n\r\n`,
  );
});

test('parseIncomingMessage decodes a GET /configs/file response as "config"', () => {
  const body = JSON.stringify({
    id_catalog: '1.2.3',
    endpoints: [{ id_endpoint: 10, id_device: 1, name: 'Volet salon', last_usage: 'shutter' }],
  });
  const text = `HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  const message = parseIncomingMessage(text, '');
  assert.equal(message.kind, 'config');
  assert.equal(message.payload.endpoints[0].last_usage, 'shutter');
});

test('parseIncomingMessage decodes a GET /devices/data response as "data"', () => {
  const body = JSON.stringify([
    {
      id: 1,
      endpoints: [
        { id: 10, error: 0, data: [{ name: 'position', value: 30, validity: 'upToDate' }] },
      ],
    },
  ]);
  const text = `HTTP/1.1 200 OK\r\nContent-Type: application/json; charset=UTF-8\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  const message = parseIncomingMessage(text, '\x02');
  assert.equal(message.kind, 'data');
  assert.equal(message.payload[0].endpoints[0].data[0].value, 30);
});

test('parseIncomingMessage decodes an unsolicited chunked PUT /devices/data push as "data"', () => {
  const body = JSON.stringify([
    {
      id: 1,
      endpoints: [
        { id: 10, error: 0, data: [{ name: 'position', value: 55, validity: 'upToDate' }] },
      ],
    },
  ]);
  const text =
    'PUT /devices/data HTTP/1.1\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n' +
    'Transac-Id: 0\r\n' +
    'Uri-Origin: /devices/data\r\n' +
    '\r\n' +
    `1a2\r\n${body}\r\n` +
    '0\r\n\r\n';
  const message = parseIncomingMessage(text, '');
  assert.equal(message.kind, 'data');
  assert.equal(message.payload[0].endpoints[0].data[0].value, 55);
});

test('parseIncomingMessage decodes the same chunked push with the mediation cmd prefix stripped', () => {
  const body = JSON.stringify([{ id: 2, endpoints: [{ id: 20, error: 0, data: [] }] }]);
  const text =
    '\x02PUT /devices/data HTTP/1.1\r\n' +
    'Content-Type: application/json; charset=UTF-8\r\n' +
    '\r\n' +
    `9\r\n${body}\r\n` +
    '0\r\n\r\n';
  const message = parseIncomingMessage(text, '\x02');
  assert.equal(message.kind, 'data');
});

test('parseIncomingMessage ignores the /refresh/all acknowledgement', () => {
  const text = 'HTTP/1.1 200 OK\r\nUri-Origin: /refresh/all\r\nContent-Length: 0\r\n\r\n';
  assert.equal(parseIncomingMessage(text, '').kind, 'ignored');
});

test('parseIncomingMessage ignores unrelated POST events (scenarios, hvac broadcasts...)', () => {
  const text = 'POST /events/home/hvac HTTP/1.1\r\nContent-Length: 2\r\n\r\n{}';
  assert.equal(parseIncomingMessage(text, '').kind, 'ignored');
});

test('parseIncomingMessage ignores an empty or non-JSON body instead of throwing', () => {
  assert.equal(parseIncomingMessage('HTTP/1.1 204 No Content\r\n\r\n', '').kind, 'ignored');
  assert.equal(parseIncomingMessage('HTTP/1.1 200 OK\r\n\r\nnot json', '').kind, 'ignored');
});

test('parseIncomingMessage reports "unknown" for unrecognized framing', () => {
  assert.equal(parseIncomingMessage('garbage', '').kind, 'unknown');
});
