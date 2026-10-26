# Changelog

All notable changes to this integration are documented in this file. The
format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project uses [semantic versioning](https://semver.org/). The Release
workflow turns the `Unreleased` section into the new version when it bumps it.

## [Unreleased]

### Added

- **Tydom shutter** dashboard widget: drive one shutter — live position and
  battery, 24 h position history, open / stop / close, and a **Position…**
  button to move it to an exact position (0-100 %).
- Store search keywords (`keywords` in the manifest).
- Full documentation of the four dashboard widgets (fr, en, de, es).

### Changed

- Requires Gladys 5.3.0 or later (store floor for the search keywords).
- Upgrade `@gladysassistant/integration-sdk` to 0.16.0.
- Only the state values that changed are sent to Gladys
  (`publishChangedStates`), plus an unchanged one every 30 min: tydom2mqtt
  republishes every state at each Tydom poll, and Gladys accepts at most 300
  states per minute.
- Release: the Docker image is published before the manifest that references
  it reaches the default branch, then checked by the store validator.

## [2.1.1] - 2026-10-18

### Fixed

- tydom2mqtt is restarted when it stops answering: after the Tydom gateway
  closed its connection, tydom2mqtt could stay connected to MQTT without
  reaching the gateway any more (`ConnectionClosedOK`, shutters no longer
  responding). The integration probes it when a command gets no answer or
  after a long silence, and restarts it (at most once per 5 min). Skipped when
  tydom2mqtt runs outside Gladys.

## [2.1.0] - 2026-10-17

### Added

- Dashboard widgets: **Tydom device** (live values, 24 h history and controls
  of one device), **Tydom shutters** (position of every shutter, open / stop /
  close them all) and **Tydom batteries** (battery levels, weakest first).

### Changed

- Requires Gladys 5.1.0 or later (dashboard widgets).

## [2.0.4] - 2026-10-14

### Fixed

- Spanish description shortened to the 100 characters allowed by the store:
  the store rejected the 2.0.3 manifest, so Gladys kept offering 2.0.2.

### Changed

- The CI runs the store validator on every push and pull request.

## [2.0.3] - 2026-10-14

### Added

- German and Spanish translations of the configuration, messages and
  documentation.

### Changed

- Upgrade `@gladysassistant/integration-sdk` to 0.15.0.

## [2.0.2] - 2026-10-08

### Added

- The store shows both transports: local (gateway IP) and cloud
  (`mediation.tydom.com`).

## [2.0.1] - 2026-10-03

Maintenance release: new cover image, no functional change.

## [2.0.0] - 2026-10-03

First public release.

### Added

- tydom2mqtt run as a sub-container managed by Gladys, configured from the
  integration settings (or an existing tydom2mqtt read from the same broker).
- One Gladys device per Tydom endpoint from tydom2mqtt's MQTT discovery:
  shutters, lights, gates and garage doors, thermostats, and their battery and
  temperature sensors; states forwarded, commands sent back.
- **Resynchronize Tydom devices** action.
- Documentation in English and French.

## 1.0.0 - 2026-10-03

Same code as 2.0.0, before the project was renamed to `gladys-tydom`.

[Unreleased]: https://github.com/quentinlegay/gladys-tydom/compare/v2.1.1...HEAD
[2.1.1]: https://github.com/quentinlegay/gladys-tydom/compare/v2.1.0...v2.1.1
[2.1.0]: https://github.com/quentinlegay/gladys-tydom/compare/v2.0.4...v2.1.0
[2.0.4]: https://github.com/quentinlegay/gladys-tydom/compare/v2.0.3...v2.0.4
[2.0.3]: https://github.com/quentinlegay/gladys-tydom/compare/v2.0.2...v2.0.3
[2.0.2]: https://github.com/quentinlegay/gladys-tydom/compare/v2.0.1...v2.0.2
[2.0.1]: https://github.com/quentinlegay/gladys-tydom/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/quentinlegay/gladys-tydom/releases/tag/v2.0.0
