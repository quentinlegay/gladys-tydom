# Tydom

Contrôlez votre box Tydom Delta Dore depuis Gladys : volets, lumières
variables, contacts de porte/fenêtre et une sonde de température extérieure.
L'intégration parle le même protocole local/médiation que le projet
[tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt), réimplémenté
directement ici — pas besoin de broker MQTT séparé ni de conteneur pont.

## Ce que vous obtenez

Après un scan réussi, un appareil Gladys est créé pour chaque point Tydom que
l'intégration reconnaît :

| `last_usage` Tydom                                                                                            | Appareil Gladys                                        |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `shutter`, `klineShutter`, `awning`                                                                           | Volet : commande ouvrir/fermer/stop + position 0-100 % |
| `light`, `others`                                                                                             | Lumière : marche/arrêt + luminosité 0-100 %            |
| `window`, `windowFrench`, `windowSliding`, `belmDoor`, `klineDoor`, `klineWindowFrench`, `klineWindowSliding` | Contact porte/fenêtre (lecture seule, ouvert/fermé)    |
| `sensorThermo`, `sensorSun`                                                                                   | Température extérieure (°C, lecture seule)             |

Les points d'un autre type (alarme, zones de chauffage, portes de garage,
compteurs d'énergie…) sont vus par l'intégration mais pas encore publiés
comme appareils — voir [Pas encore supporté](#pas-encore-supporté).

## Configuration

Il vous faut deux choses : l'**adresse mac** de la box Tydom et son **mot de
passe**. Aucun des deux n'est affiché nulle part de façon évidente, choisissez
donc l'une de ces deux méthodes :

### Option A — Compte Delta Dore (recommandé, pas besoin de fouiller l'appli)

1. Renseignez **E-mail du compte Delta Dore** et **Mot de passe du compte
   Delta Dore** avec les identifiants du compte auquel la box Tydom est
   rattachée (les mêmes que dans l'application mobile Tydom / Delta Dore).
2. Renseignez l'**adresse mac Tydom** (visible dans l'application mobile sous
   _Réglages → À propos_, ou sur l'étiquette de la box).
3. Enregistrez. L'intégration résout le mot de passe de la box depuis votre
   compte une seule fois, l'enregistre dans le champ **Mot de passe Tydom**,
   et ne réutilise plus jamais votre mot de passe de compte ensuite.

### Option B — mac + mot de passe directement

Si vous connaissez déjà le mot de passe propre à la box Tydom (par exemple
suite à une précédente installation tydom2mqtt/Home Assistant), renseignez
directement **Adresse mac Tydom** et **Mot de passe Tydom**, et laissez les
champs Delta Dore vides.

### Connexion locale ou via le cloud

Par défaut, l'intégration joint votre box via le relais de médiation Delta
Dore (`mediation.tydom.com`), qui fonctionne de partout mais ajoute un
aller-retour par internet. Si votre instance Gladys est sur le même réseau
que la box, renseignez son **adresse IP locale** (visible dans la liste des
appareils de votre routeur — la box apparaît généralement comme
`TYDOM_xxxxxxxx`) et laissez le réglage standard **Préférer la connexion
locale** activé : les commandes et mises à jour passent alors directement par
le réseau local, plus rapide et indépendant de la disponibilité des serveurs
Delta Dore.

### Intervalle de rafraîchissement

La box pousse les changements d'état au fil de l'eau (ouvrir un volet depuis
l'application Tydom met à jour Gladys en temps réel) ; l'**intervalle de
rafraîchissement** contrôle seulement la fréquence à laquelle l'intégration
redemande l'état complet, en filet de sécurité contre une notification
manquée (300 s / 5 minutes par défaut).

## Actions

- **Rescanner la box Tydom** — relit le catalogue des points et l'état actuel
  de tout, et indique combien d'appareils ont été trouvés. Utile juste après
  avoir ajouté/retiré un appareil sur la box elle-même, ou pour diagnostiquer
  un problème de connexion.

## Pas encore supporté

Les types de points Tydom suivants sont reconnus par la box mais pas encore
transformés en appareils Gladys, car leur protocole de commande diffère
suffisamment de ce qui est implémenté ici pour qu'envoyer une commande
non testée sur du matériel réel soit risqué : panneaux d'alarme, zones de
chauffage/chaudières, portes de garage et portails, et le comptage d'énergie
Tywatt. Les contributions ajoutant leur support — idéalement vérifiées sur du
matériel réel — sont bienvenues.

## Dépannage

- **« Missing Tydom credentials »** : ni un mot de passe Tydom, ni une paire
  complète identifiant/mot de passe Delta Dore n'est renseignée.
- **« Cannot connect to the Tydom box »** : vérifiez l'adresse mac (les
  séparateurs ne sont pas nécessaires, ils sont retirés automatiquement) et le
  mot de passe ; en local, vérifiez que la box répond sur le port 443 depuis
  l'hôte Gladys (`docker logs` affiche l'erreur exacte sous-jacente).
- Réglez `LOG_LEVEL=debug` sur l'intégration (via les réglages avancés du
  conteneur dans l'interface Gladys, ou `docker logs` après un redémarrage)
  pour le détail complet de chaque message Tydom échangé.
