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
Mosquitto-Broker, den die MQTT-Integration von Gladys installiert. Die Integration erfordert Gladys 5.3.0 oder neuer.

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

## Dashboard-Widgets

Wählen Sie unter **Dashboard → Bearbeiten
→ Widget hinzufügen** eines der drei Tydom-Widgets. Sie zeigen nur die in
Gladys hinzugefügten Tydom-Geräte, unter dem Namen, den Sie ihnen gegeben
haben: Ein nur erkanntes Gerät erscheint nicht.

| Widget          | Einstellungen                | Wofür                                 |
| --------------- | ---------------------------- | ------------------------------------- |
| Tydom-Gerät     | ein Gerät (Pflicht)          | alles eines Geräts sehen und steuern  |
| Tydom-Rollläden | Rollläden (alle wenn leer)   | alle Rollläden, einzeln oder zusammen |
| Tydom-Batterien | nur schwache Batterien (aus) | die Batterien der Sensoren überwachen |

### Tydom-Gerät

Ein beliebiges Gerät Ihrer Wahl:

- **Live-Werte** (bis zu 6): Rollladenposition und Lichthelligkeit als
  Anzeige, dann Sollwert, Temperatur, Feuchtigkeit, Leistung, Energie,
  Strom, Spannung, Bewegung und Batterie.
- **24-Stunden-Diagramm** des aussagekräftigsten Messwerts: Temperatur,
  sonst Leistung, Feuchtigkeit, Rollladenposition oder Helligkeit. Fehlt,
  wenn der Verlauf der Funktion in Gladys deaktiviert ist.
- **Steuerung**: **Öffnen** / **Stopp** / **Schließen** für einen Rollladen,
  **Ein** / **Aus** für ein Licht oder ein Tor, **−0,5 °C** / **+0,5 °C**
  für ein Thermostat (der Sollwert bleibt im Min/Max des Geräts).

Alles ist an die Gerätefunktionen gebunden: Werte und Diagramm folgen den
Änderungen in Echtzeit. Wird das Gerät aus Gladys gelöscht, fordert das
Widget Sie auf, ein anderes zu wählen.

### Tydom-Rollläden

Alle Ihre Rollläden auf einen Blick:

- wie viele Rollläden **offen** (Position > 0 %) und **geschlossen** sind;
- die Rollläden nach Namen sortiert mit ihrem Zustand: **Geschlossen**,
  **Offen** oder die Position in % (höchstens 10, die übrigen als
  „+N weitere“ gezählt);
- die Schaltfläche **Rollladen steuern…**: Sie öffnet ein Formular, in dem
  Sie **einen** Rollladen aus der Liste wählen und dann den Befehl —
  **Öffnen**, **Stopp**, **Schließen** oder **Position** (dann die gewünschte
  Position von 0 bis 100 % eingeben). Eine Meldung bestätigt den gesendeten
  Befehl, zum Beispiel „Wohnzimmer: schließt“. So genügt ein Widget, um jeden
  Rollladen einzeln zu steuern;
- die Schaltflächen **Alle öffnen** / **Alle stoppen** / **Alle schließen**
  (das Schließen fragt nach einer Bestätigung). Die Meldung nennt, wie viele
  Rollläden den Befehl erhalten haben und wie viele fehlgeschlagen sind.

Die Einstellung **Rollläden** beschränkt das Widget auf einige Rollläden
(pro Raum, pro Etage…): Leer gelassen nimmt es alle, auch später
hinzugefügte. Die Liste aktualisiert sich einige Sekunden nach jeder
Bewegung.

### Tydom-Batterien

Der Batteriestand jedes batteriebetriebenen Tydom-Geräts, die schwächsten
zuerst:

- wie viele Batterien **zu ersetzen** sind und wie viele **überwacht**
  werden;
- die Liste: rot bei 15 % oder weniger (oder wenn das Gerät einen
  Batteriefehler meldet), orange bei 30 % oder weniger, sonst grün.

Die Einstellung **Nur schwache Batterien** blendet die guten aus (das Widget
zeigt dann „Alle Batterien sind in Ordnung.“).

### Gut zu wissen

- Die widgeteigenen Schaltflächen (**Alle öffnen**/**Alle stoppen**/**Alle
  schließen**, **Rollladen steuern…**, **±0,5 °C**) prüfen zuerst den MQTT-Broker:
  Ist er getrennt, meldet eine Nachricht dies, statt den Befehl zu senden.
- Tydom-Rollläden melden nur ihre Position: Einen Zustand „in Bewegung“ gibt
  es nicht, die Position wird aktualisiert, wenn der Rollladen anhält.

## Fehlerbehebung

- **Kein Gerät in der Erkennung**: Prüfen Sie die Logs des Sub-Containers
  tydom2mqtt auf der Seite der Integration. `Connected to mqtt broker` und
  Geräte `created / updated` müssen erscheinen. Eine falsche MAC-Adresse oder
  ein falsches Passwort zeigt sich als Authentifizierungsfehler gegenüber dem
  Gateway.
- **„MQTT-Broker nicht erreichbar“**: Der Host muss von den Gladys-Containern
  aus erreichbar sein (lokale IP, nicht `localhost`), und Benutzer/Passwort
  müssen vom Broker akzeptiert werden.
- **Rollläden reagieren nicht mehr (`ConnectionClosedOK` in den Logs von
  tydom2mqtt)**: Das Tydom-Gateway hat seine Verbindung geschlossen und
  tydom2mqtt hat sich nicht neu verbunden. Die Integration erkennt das (keine
  Antwort nach einem Befehl oder lange Stille) und startet tydom2mqtt
  innerhalb einer Minute automatisch neu. Senden Sie den Befehl erneut, sobald
  die Geräte aktualisiert sind.
- **Ein Tor tut das Gegenteil des angezeigten Zustands**: Tore werden über
  Impulse gesteuert, der angezeigte Zustand ist der zuletzt vom Tydom-Gateway
  gemeldete.

Setzen Sie `LOG_LEVEL=debug` für alle Details der Integrations-Logs.
