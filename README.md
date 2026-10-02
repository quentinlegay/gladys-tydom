# Gladys Tydom integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
controls **Delta Dore Tydom** devices (shutters, lights, gates, garage doors,
thermostats, sensors) through [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt).

Built from the official
[integration template](https://github.com/GladysAssistant/integration-template-js)
with the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [docs/en.md](./docs/en.md) · [docs/fr.md](./docs/fr.md).

## Architecture

```
Tydom gateway <──> tydom2mqtt (sub-container) <──> MQTT broker <──> this integration <──> Gladys
```

- **tydom2mqtt runs as a Gladys sub-container.** The manifest declares it
  (`containers`, `start: manual`, image pinned to a release). Once the user has
  filled in the configuration, the integration calls
  `gladys.startContainer('tydom2mqtt', { env })` with the same variables as the
  usual docker-compose (`TYDOM_MAC`, `TYDOM_PASSWORD`, `TYDOM_IP`, `MQTT_HOST`,
  `MQTT_USER`, `MQTT_PASSWORD`…). Credentials never appear in the public
  manifest. A configuration change stops and recreates the sub-container with
  the new env; a fingerprint of the applied env is kept in `/data` so that an
  integration restart does not restart tydom2mqtt for nothing.
- **Devices come from the MQTT discovery of tydom2mqtt.** tydom2mqtt announces
  every entity with a retained Home Assistant discovery message
  (`homeassistant/<component>/tydom/<id>/config`) carrying its state and
  command topics. The integration subscribes to them, maps each entity to
  Gladys features, and groups them per Tydom endpoint (one Gladys device per
  shutter, light…). No tydom2mqtt topic layout is hard-coded.
- **States and commands go through the broker.** State messages are forwarded
  with `publishState`; Gladys commands are published on the command topics
  announced by the discovery.

## Project structure

```
.
├─ index.js                          # SDK wiring (scan, setValue, config, actions)
├─ src/
│  ├─ config.js                      # config defaults, normalization, validation
│  ├─ container.js                   # tydom2mqtt sub-container lifecycle
│  └─ tydom/
│     ├─ mapping.js                  # HA discovery entity -> Gladys features (pure)
│     ├─ catalog.js                  # entities -> Gladys devices, state/command routing
│     └─ bridge.js                   # MQTT client (discovery, states, commands)
├─ test/                             # node --test unit tests
├─ docs/{en,fr}.md                   # user documentation, re-hosted by Gladys
├─ gladys-assistant-integration.json # manifest (config schema, sub-container…)
└─ Dockerfile
```

## Supported mapping

| tydom2mqtt entity         | Gladys features                                                   |
| ------------------------- | ----------------------------------------------------------------- |
| `cover` (shutter, garage) | `shutter` / `state` (1 open, -1 close, 0 stop) + `position` 0-100 |
| `light`                   | `light` / `binary` + `brightness`                                 |
| `switch` (gate, door)     | `switch` / `binary` (sends the TOGGLE impulse)                    |
| `climate`                 | `thermostat` / `target-temperature` + `temperature-sensor`        |
| `sensor`                  | battery, temperature, humidity, power, energy, current, voltage   |
| `binary_sensor`           | `battDefect` → battery-low, motion                                |

tydom2mqtt publishes one sensor per Tydom attribute; only the measurements
listed above are kept, the technical attributes are ignored.

## Run it locally

```bash
npm install
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="tydom" \
DATA_DIR=./data \
LOG_LEVEL=debug \
npm start
```

## Quality checks

```bash
npm run format:check
npm run lint
npm test
npx github:GladysAssistant/integration-store .   # store admission rules
```

## Publishing

1. Push this repository to GitHub and add the topic
   `gladys-assistant-integration`.
2. Replace the owner in `docker_image` and `cover_image` of
   `gladys-assistant-integration.json` with your GitHub account, and replace
   `cover.png` with a real 800×534 px cover.
3. Run **Actions → Release → Run workflow**: it bumps the version, tags and
   builds the multi-arch image to `ghcr.io`. Make the package public.

To upgrade tydom2mqtt, bump the tag of the `tydom2mqtt` sub-container in the
manifest.

## License

Apache-2.0
