# Tydom

Control your Delta Dore Tydom devices from Gladys: shutters, lights, gates and
garage doors, thermostats, plus their battery level and temperature sensors.

## How it works

```
Tydom gateway  <──>  tydom2mqtt  <──>  MQTT broker  <──>  Gladys (this integration)
```

The integration runs [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt) as
a sub-container managed by Gladys. tydom2mqtt connects to your Tydom gateway
and publishes your devices on your MQTT broker. The integration reads them
from the broker and sends your commands back through it.

You need an MQTT broker reachable from Gladys, for instance the Mosquitto
broker installed by the Gladys MQTT integration. The integration requires Gladys 5.3.0 or later.

## Configuration

1. Open the **Configuration** tab of the integration.
2. **Tydom gateway**
   - **MAC address**: printed under the gateway, it starts with `001A25`.
   - **Password**: the one printed under the gateway. You can leave it empty
     and fill in your **Delta Dore account** (e-mail + password) instead:
     tydom2mqtt then retrieves the gateway password itself.
   - **IP address**: the local IP of the gateway (recommended, give it a fixed
     IP in your router). Leave `mediation.tydom.com` to go through the Delta
     Dore cloud.
3. **MQTT broker**: host, port, user and password of your broker. Use the LAN
   IP address of the machine running the broker — `localhost` would point
   inside the containers.
4. Save. Gladys starts tydom2mqtt with these settings; your devices show up in
   the **Discovery** tab within a minute, ready to be added.

Every change of configuration restarts tydom2mqtt with the new values.

### Already running tydom2mqtt?

If you already run tydom2mqtt yourself (docker-compose, Home Assistant
add-on…) on the same broker, disable **Run tydom2mqtt from Gladys**: the
integration then only reads its topics. Only the MQTT fields are needed.

## Supported devices

| Tydom device         | In Gladys                                     |
| -------------------- | --------------------------------------------- |
| Shutter              | Open / close / stop + position (0 = closed)   |
| Garage door          | Open / close / stop + position                |
| Light                | On/off + brightness                           |
| Gate, door (impulse) | Switch: each command sends a TOGGLE impulse   |
| Thermostat / boiler  | Target temperature + current temperature      |
| Sensors              | Battery, temperature, humidity, power, energy |

Not supported yet: alarm, heating modes and presets, shutter tilt.

## Actions

- **Resynchronize Tydom devices** — asks tydom2mqtt to reload the Tydom
  configuration and republish every device. Use it after adding a device to
  your Tydom installation.

## Dashboard widgets

In **Dashboard → Edit → Add a widget**, pick
one of the three Tydom widgets. They only show the Tydom devices added in
Gladys, under the name you gave them: a device that is only discovered does
not appear.

| Widget          | Settings                 | For                                    |
| --------------- | ------------------------ | -------------------------------------- |
| Tydom device    | one device (required)    | see and control everything of a device |
| Tydom shutters  | shutters (all if empty)  | every shutter, one by one or all       |
| Tydom batteries | only low batteries (off) | keep an eye on the sensor batteries    |

### Tydom device

One device of your choice, whatever it is:

- **Live values** (up to 6): shutter position and light brightness as
  gauges, then setpoint, temperature, humidity, power, energy, current,
  voltage, motion and battery.
- **24-hour chart** of the most telling measure: temperature, else power,
  humidity, shutter position or brightness. Absent when the feature history
  is disabled in Gladys.
- **Controls**: **Open** / **Stop** / **Close** for a shutter, **On** /
  **Off** for a light or a gate, **−0.5 °C** / **+0.5 °C** for a thermostat
  (the setpoint stays within the device min/max).

Everything is bound to the device features: values and chart follow the
changes in real time. If the device is deleted from Gladys, the widget asks
you to pick another one.

### Tydom shutters

All your shutters at a glance:

- how many shutters are **open** (position > 0 %) and **closed**;
- the shutters sorted by name with their state: **Closed**, **Open** or the
  position in % (10 at most, the others counted as "+N more");
- the **Control a shutter…** button: it opens a form where you pick **one**
  shutter in the list, then the order — **Open**, **Stop**, **Close** or
  **Position** (then type the position you want, from 0 to 100 %). A message
  confirms the order sent, for instance "Living room: closing". One widget is
  enough to drive every shutter separately;
- the **Open all** / **Stop all** / **Close all** buttons (closing asks for a
  confirmation). The message tells how many shutters got the order, and how
  many failed.

The **Shutters** setting restricts the widget to a few shutters (per room,
per floor…): left empty, it takes them all, including the ones added later.
The list updates a few seconds after each move.

### Tydom batteries

The battery level of every battery-powered Tydom device, the weakest first:

- how many batteries are **to replace** and how many are **tracked**;
- the list: red at 15 % or less (or when the device reports a battery
  fault), orange at 30 % or less, green above.

The **Only low batteries** setting hides the healthy ones (the widget then
shows "All batteries are fine.").

### Good to know

- The widgets' own buttons (**Open all**/**Stop all**/**Close all**,
  **Control a shutter…**, **±0.5 °C**) check the MQTT broker first: when it is
  disconnected, a message says so instead of sending the order.
- Tydom shutters only report their position: there is no "moving" state, the
  position updates when the shutter stops.

## Troubleshooting

- **No device in Discovery**: check the tydom2mqtt sub-container logs in the
  integration page. `Connected to mqtt broker` and devices
  `created / updated` must appear. A wrong MAC or password shows as an
  authentication error towards the gateway.
- **"MQTT broker unreachable"**: the host must be reachable from the Gladys
  containers (LAN IP, not `localhost`), and the user/password accepted by the
  broker.
- **Shutters no longer respond (`ConnectionClosedOK` in the tydom2mqtt
  logs)**: the Tydom gateway closed its connection and tydom2mqtt did not
  reconnect. The integration detects it (no answer after a command, or a long
  silence) and restarts tydom2mqtt automatically within a minute. Send the
  command again once the devices are updated.
- **A gate does the opposite of what is shown**: gates are driven by
  impulses, the state shown is the last one reported by the Tydom gateway.

Set `LOG_LEVEL=debug` for the full detail of the integration logs.
