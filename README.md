# Gladys Tydom integration

External integration for [Gladys Assistant](https://gladysassistant.com) that
controls **Delta Dore Tydom** devices (shutters, lights, gates, garage doors,
thermostats, sensors) through [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt).

Built from the official
[integration template](https://github.com/GladysAssistant/integration-template-js)
with the [`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

User documentation: [docs/en.md](./docs/en.md) · [docs/fr.md](./docs/fr.md) · [docs/de.md](./docs/de.md) · [docs/es.md](./docs/es.md).

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
  with `publishChangedStates`: tydom2mqtt republishes every state at each
  Tydom poll, only the changed values reach Gladys (300 states/min limit),
  plus an unchanged one every 30 min. Gladys commands are published on the command topics
  announced by the discovery.
- **Watchdog.** tydom2mqtt can lose the Tydom websocket for good (the
  gateway closes it, its reconnect task dies) while its process and MQTT
  connection stay up: commands then fail with `ConnectionClosedOK`. When a
  command gets no live message back within 20 s, or nothing came for 15 min,
  the integration probes tydom2mqtt (`gladys/tydom/update`, which makes it
  re-read the gateway); still silent 30 s later, it restarts the
  sub-container (at most once per 5 min). Skipped when tydom2mqtt runs
  outside Gladys.
- **Dashboard widgets** (manifest `widgets`, all in
  `src/widgets.js`; user-facing description in `docs/*.md`):

  | Key            | Settings               | Content                                                                   | Actions (`onWidgetAction`)                                                                                   | Refresh                       |
  | -------------- | ---------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------- |
  | `tydom_device` | `device` (select)      | ≤ 6 device-bound tiles, one 24 h chart, feature buttons                   | `setpoint_down` / `setpoint_up` (±0.5 °C)                                                                    | live (bound), TTL 300 s       |
  | `shutter`      | `device` (select)      | position gauge, battery, 24 h stepline, open/stop/close, `Position…` form | `set_position` (`values.position`, 0-100)                                                                    | live + nudge on shutter state |
  | `shutters`     | `devices` (multi, all) | open/closed counters, status list (≤ 10), one-shutter form, "all" buttons | `control` (`values.shutter`, `values.order`, `values.position`), `open` / `stop` / `close` (close confirmed) | nudge on shutter state, 60 s  |
  | `batteries`    | `only_low` (boolean)   | to-replace / tracked counters, status list worst first                    | —                                                                                                            | nudge on battery, 600 s       |

  The `build*` functions are pure (devices + last values -> content) and
  checked against `validateWidgetContent` in the tests. Device-bound
  components follow the states with no refresh; the inline values are nudged
  with `requestWidgetRefresh` (throttled under the core's 1 per 10 s limit).
  The `shutter` form (`action.fields`) needs a core with widget forms: an
  action received without `values` is refused, never sent with a guess.

## Project structure

```
.
├─ index.js                          # SDK wiring (scan, setValue, config, actions, widgets)
├─ src/
│  ├─ config.js                      # config defaults, normalization, validation
│  ├─ container.js                   # tydom2mqtt sub-container lifecycle
│  ├─ widgets.js                     # dashboard widgets (device, shutter(s), batteries)
│  └─ tydom/
│     ├─ mapping.js                  # HA discovery entity -> Gladys features (pure)
│     ├─ catalog.js                  # entities -> Gladys devices, state/command routing
│     ├─ bridge.js                   # MQTT client (discovery, states, commands)
│     └─ watchdog.js                 # restarts tydom2mqtt when it stops answering
├─ test/                             # node --test unit tests
├─ docs/{en,fr,de,es}.md             # user documentation, re-hosted by Gladys
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
3. Note your changes under `Unreleased` in `CHANGELOG.md` as you go.
4. Run **Actions → Release → Run workflow**: it bumps the version, turns the
   `Unreleased` changelog section into that version, tags,
   builds the multi-arch image to `ghcr.io`, and only then pushes the bumped
   manifest to the branch (the store drops an integration whose image cannot
   be pulled) and runs the store validator with the image check. Make the
   package public.

The CI runs the store validator on every push and pull request
(`npx github:GladysAssistant/integration-store --skip-image-check`); run it
locally before publishing.

To upgrade tydom2mqtt, bump the tag of the `tydom2mqtt` sub-container in the
manifest.

## License

Apache-2.0
