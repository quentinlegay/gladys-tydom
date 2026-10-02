# Tydom

Pilotez vos appareils Delta Dore Tydom depuis Gladys : volets roulants,
lumières, portails et portes de garage, thermostats, ainsi que leurs capteurs
de batterie et de température.

## Fonctionnement

```
Box Tydom  <──>  tydom2mqtt  <──>  Broker MQTT  <──>  Gladys (cette intégration)
```

L'intégration lance [tydom2mqtt](https://github.com/tydom2mqtt/tydom2mqtt)
dans un sous-conteneur géré par Gladys. tydom2mqtt se connecte à votre box
Tydom et publie vos appareils sur votre broker MQTT. L'intégration les lit
sur le broker et renvoie vos commandes par ce même broker.

Il vous faut un broker MQTT joignable depuis Gladys, par exemple le broker
Mosquitto installé par l'intégration MQTT de Gladys.

## Configuration

1. Ouvrez l'onglet **Configuration** de l'intégration.
2. **Box Tydom**
   - **Adresse MAC** : inscrite sous la box, elle commence par `001A25`.
   - **Mot de passe** : celui inscrit sous la box. Vous pouvez le laisser vide
     et renseigner à la place votre **compte Delta Dore** (e-mail + mot de
     passe) : tydom2mqtt récupère alors lui-même le mot de passe de la box.
   - **Adresse IP** : l'IP locale de la box (recommandé, fixez-la dans votre
     box internet). Laissez `mediation.tydom.com` pour passer par le cloud
     Delta Dore.
3. **Broker MQTT** : hôte, port, utilisateur et mot de passe de votre broker.
   Utilisez l'adresse IP locale de la machine du broker — `localhost`
   désignerait l'intérieur des conteneurs.
4. Enregistrez. Gladys démarre tydom2mqtt avec ces paramètres ; vos appareils
   apparaissent dans l'onglet **Découverte** en moins d'une minute, prêts à
   être ajoutés.

Chaque modification de la configuration redémarre tydom2mqtt avec les
nouvelles valeurs.

### Vous utilisez déjà tydom2mqtt ?

Si vous lancez déjà tydom2mqtt vous-même (docker-compose, add-on Home
Assistant…) sur le même broker, désactivez **Lancer tydom2mqtt depuis
Gladys** : l'intégration se contente alors de lire ses topics. Seuls les
champs MQTT sont nécessaires.

## Appareils pris en charge

| Appareil Tydom             | Dans Gladys                                                |
| -------------------------- | ---------------------------------------------------------- |
| Volet roulant              | Ouvrir / fermer / stop + position (0 = fermé)              |
| Porte de garage            | Ouvrir / fermer / stop + position                          |
| Lumière                    | Allumer/éteindre + luminosité                              |
| Portail, porte (impulsion) | Interrupteur : chaque commande envoie une impulsion TOGGLE |
| Thermostat / chaudière     | Consigne + température actuelle                            |
| Capteurs                   | Batterie, température, humidité, puissance, énergie        |

Pas encore pris en charge : alarme, modes et préréglages de chauffage,
inclinaison des lames.

## Actions

- **Resynchroniser les appareils Tydom** — demande à tydom2mqtt de recharger
  la configuration Tydom et de republier tous les appareils. À utiliser après
  avoir ajouté un appareil à votre installation Tydom.

## Dépannage

- **Aucun appareil dans Découverte** : consultez les logs du sous-conteneur
  tydom2mqtt sur la page de l'intégration. `Connected to mqtt broker` et des
  appareils `created / updated` doivent apparaître. Une mauvaise adresse MAC
  ou un mauvais mot de passe se traduit par une erreur d'authentification
  auprès de la box.
- **« Broker MQTT injoignable »** : l'hôte doit être joignable depuis les
  conteneurs Gladys (IP locale, pas `localhost`), et l'utilisateur/mot de
  passe acceptés par le broker.
- **Un portail fait l'inverse de l'état affiché** : les portails sont pilotés
  par impulsions, l'état affiché est le dernier remonté par la box Tydom.

Passez `LOG_LEVEL=debug` pour le détail complet des logs de l'intégration.
