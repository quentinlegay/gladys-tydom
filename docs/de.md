# Tydom

Steuern Sie Ihre Delta Dore Tydom-Geräte aus Gladys: Rollläden, Lichter, Tore
und Garagentore, Thermostate sowie deren Batterie- und Temperatursensoren.

## Funktionsweise

```
Tydom-Gateway  <──>  tydom2mqtt  <──>  MQTT-Broker  <──>  Gladys (diese Integration)
```

Die Integration startet [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt)
in einem von Gladys verwalteten Sub-Container. tydom2mqtt verbindet sich mit
Ihrem Tydom-Gateway und veröffentlicht Ihre Geräte auf Ihrem MQTT-Broker. Die
Integration liest sie vom Broker und sendet Ihre Befehle über ihn zurück.

Sie benötigen einen von Gladys erreichbaren MQTT-Broker, zum Beispiel den
Mosquitto-Broker, den die MQTT-Integration von Gladys installiert.

## Konfiguration

1. Öffnen Sie den Tab **Konfiguration** der Integration.
2. **Tydom-Gateway**
   - **MAC-Adresse**: steht auf der Unterseite des Gateways und beginnt mit
     `001A25`.
   - **Passwort**: das auf der Unterseite des Gateways aufgedruckte. Sie
     können es leer lassen und stattdessen Ihr **Delta Dore-Konto** (E-Mail +
     Passwort) angeben: tydom2mqtt ruft das Gateway-Passwort dann selbst ab.
   - **IP-Adresse**: die lokale IP des Gateways (empfohlen, vergeben Sie ihr in
     Ihrem Router eine feste IP). Lassen Sie `mediation.tydom.com` stehen, um
     über die Delta Dore-Cloud zu gehen.
3. **MQTT-Broker**: Host, Port, Benutzer und Passwort Ihres Brokers. Verwenden
   Sie die lokale IP-Adresse des Rechners, auf dem der Broker läuft —
   `localhost` würde auf das Innere der Container zeigen.
4. Speichern. Gladys startet tydom2mqtt mit diesen Einstellungen; Ihre Geräte
   erscheinen innerhalb einer Minute im Tab **Erkennung**, bereit zum
   Hinzufügen.

Jede Änderung der Konfiguration startet tydom2mqtt mit den neuen Werten neu.

### Sie betreiben tydom2mqtt bereits?

Wenn Sie tydom2mqtt bereits selbst (docker-compose, Home Assistant-Add-on…)
auf demselben Broker betreiben, deaktivieren Sie **tydom2mqtt über Gladys
starten**: Die Integration liest dann nur dessen Topics. Nur die MQTT-Felder
sind erforderlich.

## Unterstützte Geräte

| Tydom-Gerät          | In Gladys                                         |
| -------------------- | ------------------------------------------------- |
| Rollladen            | Öffnen / schließen / stopp + Position (0 = zu)    |
| Garagentor           | Öffnen / schließen / stopp + Position             |
| Licht                | Ein/aus + Helligkeit                              |
| Tor, Tür (Impuls)    | Schalter: jeder Befehl sendet einen TOGGLE-Impuls |
| Thermostat / Heizung | Solltemperatur + aktuelle Temperatur              |
| Sensoren             | Batterie, Temperatur, Feuchte, Leistung, Energie  |

Noch nicht unterstützt: Alarmanlage, Heizmodi und Voreinstellungen,
Lamellenneigung.

## Aktionen

- **Tydom-Geräte neu synchronisieren** — fordert tydom2mqtt auf, die
  Tydom-Konfiguration neu zu laden und alle Geräte erneut zu veröffentlichen.
  Nutzen Sie dies, nachdem Sie Ihrer Tydom-Installation ein Gerät hinzugefügt
  haben.

## Fehlerbehebung

- **Kein Gerät in der Erkennung**: Prüfen Sie die Logs des Sub-Containers
  tydom2mqtt auf der Seite der Integration. `Connected to mqtt broker` und
  Geräte `created / updated` müssen erscheinen. Eine falsche MAC-Adresse oder
  ein falsches Passwort zeigt sich als Authentifizierungsfehler gegenüber dem
  Gateway.
- **„MQTT-Broker nicht erreichbar“**: Der Host muss von den Gladys-Containern
  aus erreichbar sein (lokale IP, nicht `localhost`), und Benutzer/Passwort
  müssen vom Broker akzeptiert werden.
- **Ein Tor tut das Gegenteil des angezeigten Zustands**: Tore werden über
  Impulse gesteuert, der angezeigte Zustand ist der zuletzt vom Tydom-Gateway
  gemeldete.

Setzen Sie `LOG_LEVEL=debug` für alle Details der Integrations-Logs.
