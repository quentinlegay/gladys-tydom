# Gladys Tydom integration

An **external integration** for [Gladys Assistant](https://gladysassistant.com)
that controls Delta Dore **Tydom** boxes — shutters, dimmable lights,
door/window contacts and an outdoor temperature probe — built with the
[JavaScript SDK](https://github.com/GladysAssistant/integration-sdk-js) on top
of the [`integration-template-js`](https://github.com/GladysAssistant/integration-template-js)
starter template. The Tydom wire protocol (Digest-authenticated WebSocket,
local or through Delta Dore's mediation relay) is reimplemented directly here,
reverse-engineered and documented by the
[tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt) project — this
integration owes it the entire protocol knowledge, without depending on it or
on a separate MQTT broker at runtime.

See [`docs/en.md`](docs/en.md) / [`docs/fr.md`](docs/fr.md) for the **user**
documentation (what you get, how to configure it, troubleshooting) — this
README is for people working on the integration's code.

## Why this isn't the template's static device list

The template ships one hard-coded demo device per file (`src/devices/light.js`
simulates a single fixed bulb). A Tydom box is the opposite: a variable,
user-specific set of endpoints only known once the box answers
`GET /configs/file`. So instead of a static `DEVICE_BLUEPRINTS` array, this
integration is built around a **runtime catalog**:

```
.
├─ index.js                          # SDK bootstrap + event wiring
├─ src/
│  ├─ tydom/                         # Everything Tydom-protocol-specific
│  │  ├─ const.js                    #   protocol constants + last_usage -> kind maps
│  │  ├─ digest.js                   #   HTTP Digest auth (RFC 2617), pure/testable
│  │  ├─ frame.js                    #   wire framing: build commands, parse incoming messages
│  │  ├─ credentials.js              #   Delta Dore account -> gateway password (one-time)
│  │  ├─ client.js                   #   the WebSocket connection (the only network I/O)
│  │  ├─ registry.js                 #   runtime device catalog + last known state
│  │  └─ service.js                  #   orchestration: reconnect, periodic refresh, commands
│  ├─ devices/                       # One blueprint per Gladys DEVICE KIND (not per device)
│  │  ├─ index.js                    #   kind -> blueprint dispatch, driven by the registry
│  │  ├─ cover.js                    #   shutters/awnings: position + open/close/stop
│  │  ├─ light.js                    #   dimmable lights: on/off + brightness
│  │  ├─ openingSensor.js            #   door/window contacts (read-only)
│  │  └─ temperatureSensor.js        #   outdoor temperature probe (read-only)
│  └─ config.js                      # config defaults + normalization
├─ docs/                             # user documentation (en/fr, re-hosted by Gladys)
├─ gladys-assistant-integration.json # manifest
└─ Dockerfile                        # Node 24 Alpine, read-only rootfs ready
```

Each `src/devices/*.js` blueprint exposes the same shape, keyed by `kind`
(matching `src/tydom/registry.js#kindForUsage`):

- `buildDevice(gladys, entry)` — the discovery payload for one catalog entry;
- `onSetValue(gladys, service, entry, feature, value)` — run a user command
  (covers and lights only; sensors are read-only);
- `publishUpdate(gladys, entry, changed, values)` — turn a raw Tydom state
  change into the `{ featureExternalId, value }` pairs to publish.

`src/devices/index.js` is the only place that knows about ALL kinds; a new
device kind is added by writing one blueprint file and registering it there —
`index.js` and `src/tydom/service.js` never change.

## Protocol notes worth knowing before touching `src/tydom/`

- **Digest auth `uri`**: must be the request path + query only (e.g.
  `/mediation/client?mac=...&appli=1`), never the absolute URL — this is
  cross-checked in `test/digest.test.js` against Python's
  `requests.auth.HTTPDigestAuth` (what tydom2mqtt itself uses), since getting
  this wrong produces a response the box silently rejects.
- **Shutter position is inverted**: Tydom's own `position` field is the
  percentage _closed_ (0 = open, 100 = closed); Gladys' `SHUTTER.POSITION` is
  the percentage _open_ (the same convention Home Assistant/zigbee2mqtt covers
  use in Gladys' own `mqtt` service). `src/devices/cover.js#toGladysPosition`/
  `toTydomPosition` is the only place this conversion happens.
- **Local vs. mediation mode** changes three things at once: the host
  (box IP vs. `mediation.tydom.com`), the command prefix byte (`''` vs.
  `'\x02'` prepended to every frame), and the Digest realm (`"protected area"`
  vs. `"ServiceMedia"`) — see `src/tydom/client.js`.
- **Garage doors/gates, heating (boiler/thermostat), alarm panels and Tywatt
  energy metering are intentionally not implemented.** Tydom reports/commands
  them through different field names and conventions than shutters/lights
  (e.g. a garage door's position lives in `level`/`levelCmd`, not
  `position`/`positionCmd`) that were not possible to validate without real
  hardware — see `src/tydom/const.js` for the exact reasoning and the
  supported `last_usage` lists.

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="gladys-tydom" \
LOG_LEVEL=debug \
npm start
```

The three `GLADYS_*` variables are injected by the Gladys supervisor when the
integration runs inside its sandboxed container; the SDK reads them
automatically.

## Quality checks

```bash
npm run format:check   # Prettier
npm run lint            # ESLint
npm test                 # node --test (no live Tydom box needed: the protocol
                          # layer is unit-tested with fixed payloads and an
                          # injectable fake WebSocket client, see test/service.test.js)
```

## Publishing

Same 5-step flow as the template this is based on — fork/rename, edit the
manifest's `docker_image`/`cover_image` to your own repository, add the
`gladys-assistant-integration` GitHub topic, then **Actions → Release → Run
workflow** to bump the version, tag, and build the multi-arch image. See the
[template's own README](https://github.com/GladysAssistant/integration-template-js#publish-in-5-steps)
for the full walkthrough — it applies unchanged.

## License

Apache-2.0
