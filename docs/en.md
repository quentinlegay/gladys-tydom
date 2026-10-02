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
broker installed by the Gladys MQTT integration.

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

## Troubleshooting

- **No device in Discovery**: check the tydom2mqtt sub-container logs in the
  integration page. `Connected to mqtt broker` and devices
  `created / updated` must appear. A wrong MAC or password shows as an
  authentication error towards the gateway.
- **"MQTT broker unreachable"**: the host must be reachable from the Gladys
  containers (LAN IP, not `localhost`), and the user/password accepted by the
  broker.
- **A gate does the opposite of what is shown**: gates are driven by
  impulses, the state shown is the last one reported by the Tydom gateway.

Set `LOG_LEVEL=debug` for the full detail of the integration logs.
