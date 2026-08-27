# Tydom

Control your Delta Dore Tydom box from Gladys: shutters, dimmable lights,
door/window contacts and an outdoor temperature probe. It speaks the same
local/mediation protocol as the [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt)
project, reimplemented directly in this integration — no separate MQTT broker
or bridge container needed.

## What you get

After a successful scan, one Gladys device is created per Tydom endpoint the
integration recognizes:

| Tydom `last_usage`                                                                                            | Gladys device                                      |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `shutter`, `klineShutter`, `awning`                                                                           | Shutter: open/close/stop command + 0-100% position |
| `light`, `others`                                                                                             | Light: on/off + 0-100% brightness                  |
| `window`, `windowFrench`, `windowSliding`, `belmDoor`, `klineDoor`, `klineWindowFrench`, `klineWindowSliding` | Door/window contact (read-only open/closed)        |
| `sensorThermo`, `sensorSun`                                                                                   | Outdoor temperature (°C, read-only)                |

Endpoints of any other kind (alarm panels, heating zones, garage doors,
energy meters...) are seen by the integration but not yet published as
devices — see [Not supported yet](#not-supported-yet).

## Configuration

You need two things: the Tydom box's **mac address** and its **password**.
Both are printed nowhere obvious, so pick one of these two paths:

### Option A — Delta Dore account (recommended, no app digging)

1. Fill in **Delta Dore account email** and **Delta Dore account password**
   with the credentials of the account the Tydom box is registered to (the
   same ones used in the Tydom / Delta Dore mobile app).
2. Fill in the **Tydom mac address** (found in the mobile app under
   _Settings → About_, or on the box's own sticker).
3. Save. The integration resolves the gateway password from your account
   once, saves it into the **Tydom password** field, and never replays your
   account password again afterwards.

### Option B — mac + password directly

If you already know the Tydom box's own password (e.g. from a previous
tydom2mqtt/Home Assistant setup), fill in **Tydom mac address** and **Tydom
password** directly and leave the Delta Dore fields empty.

### Local vs. cloud connection

By default the integration reaches your box through Delta Dore's mediation
relay (`mediation.tydom.com`), which works from anywhere but adds a
round-trip through the internet. If your Gladys instance is on the same
network as the box, fill in its **local IP address** (find it in your
router's device list — the box usually shows up as `TYDOM_xxxxxxxx`) and keep
the standard **Prefer the local connection** toggle enabled: commands and
updates then go directly over the LAN, faster and independent from Delta
Dore's own servers being up.

### Refresh interval

The box pushes state changes as they happen (opening a shutter from the
Tydom app updates Gladys in real time); the **Refresh interval** only
controls how often the integration re-asks for the full state as a
safety net against a missed push (default 300s / 5 minutes).

## Actions

- **Rescan the Tydom box** — re-reads the endpoint catalog and the current
  state of everything, and reports how many devices were found. Useful right
  after adding/removing a device on the box itself, or when troubleshooting a
  connection.

## Not supported yet

The following Tydom endpoint kinds are recognized by the box but not yet
turned into Gladys devices, because their command protocol differs enough
from what is implemented here that shipping a guess without testing against
real hardware would risk sending the wrong command to a physical device:
alarm panels, heating zones/boilers, garage doors and gates, and Tywatt
energy metering. Contributions adding support for these — ideally verified
against real hardware — are welcome.

## Troubleshooting

- **"Missing Tydom credentials"**: neither a Tydom password nor a complete
  Delta Dore login/password pair is set.
- **"Cannot connect to the Tydom box"**: double-check the mac address (no
  separators needed, they are stripped automatically) and the password; if
  using a local IP, confirm the box answers on port 443 from the Gladys host
  (`docker logs` shows the exact underlying error).
- Set `LOG_LEVEL=debug` on the integration (via the Gladys UI's advanced
  container settings, or `docker logs` after a restart) for the full detail
  of every Tydom message exchanged.
