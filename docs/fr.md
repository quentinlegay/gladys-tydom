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

## Widgets du tableau de bord

Nécessite Gladys 5.1.0 ou plus récent. Dans **Tableau de bord → Modifier →
Ajouter un widget**, choisissez l'un des quatre widgets Tydom. Ils n'affichent
que les appareils Tydom ajoutés dans Gladys, sous le nom que vous leur avez
donné : un appareil seulement découvert n'y apparaît pas.

| Widget         | Réglages                          | Pour                                    |
| -------------- | --------------------------------- | --------------------------------------- |
| Appareil Tydom | un appareil (obligatoire)         | tout voir et piloter d'un appareil      |
| Volet Tydom    | un volet (obligatoire)            | piloter un volet, position précise      |
| Volets Tydom   | des volets (tous si vide)         | l'état de la maison, tout ouvrir/fermer |
| Piles Tydom    | seulement les piles faibles (non) | surveiller les piles des capteurs       |

### Appareil Tydom

Un appareil au choix, quel qu'il soit :

- **Valeurs en direct** (jusqu'à 6) : position d'un volet et luminosité
  d'une lumière en jauge, puis consigne, température, humidité, puissance,
  énergie, courant, tension, mouvement et pile.
- **Graphique des dernières 24 h** de la mesure la plus parlante :
  température, sinon puissance, humidité, position du volet ou luminosité.
  Absent si l'historique de la fonctionnalité est désactivé dans Gladys.
- **Commandes** : **Ouvrir** / **Stop** / **Fermer** pour un volet,
  **Allumer** / **Éteindre** pour une lumière ou un portail, **−0,5 °C** /
  **+0,5 °C** pour un thermostat (la consigne est bornée par le min/max de
  l'appareil).

Tout est lié aux fonctionnalités de l'appareil : les valeurs et le graphique
suivent les changements en temps réel. Si l'appareil est supprimé de Gladys,
le widget vous invite à en choisir un autre.

### Volet Tydom

Pour piloter **un seul volet** depuis le tableau de bord :

- la **position** en jauge (0 % fermé, 100 % ouvert) et le niveau de pile si
  le volet en a une, en direct ;
- l'**historique de la position** sur 24 h ;
- les boutons **Ouvrir** / **Stop** / **Fermer** ;
- le bouton **Position…** : il ouvre un petit formulaire pré-rempli avec la
  position actuelle, saisissez une valeur entre 0 et 100 % et validez pour y
  amener le volet. Un message confirme l'ordre envoyé.

Le bouton **Position…** n'apparaît que pour les volets dont la box Tydom
accepte une position (les volets motorisés classiques) ; il demande une
version de Gladys qui gère les formulaires de widget — sur une version plus
ancienne, l'ordre est refusé avec un message plutôt qu'envoyé au hasard. Si
l'appareil choisi n'est pas un volet, le widget l'indique. Ajoutez un widget
par volet à piloter.

### Volets Tydom

Tous vos volets d'un coup d'œil :

- le nombre de volets **ouverts** (position > 0 %) et **fermés** ;
- la liste des volets triés par nom avec leur état : **Fermé**, **Ouvert**
  ou la position en % (10 au plus, les suivants comptés en « +N autres ») ;
- les boutons **Tout ouvrir** / **Tout arrêter** / **Tout fermer** (la
  fermeture demande une confirmation). Le message indique combien de volets
  ont reçu l'ordre, et combien ont échoué.

Le réglage **Volets** limite le widget à quelques volets (par pièce, par
étage…) : laissé vide, il les prend tous, y compris ceux ajoutés plus tard.
La liste se met à jour quelques secondes après chaque mouvement.

### Piles Tydom

Le niveau de pile de chaque appareil Tydom sur pile, les plus faibles en
premier :

- le nombre de piles **à changer** et le nombre de piles **suivies** ;
- la liste : en rouge à 15 % ou moins (ou si l'appareil signale un défaut de
  pile), en orange à 30 % ou moins, en vert au-delà.

Le réglage **Seulement les piles faibles** masque celles en bon état (le
widget affiche alors « Toutes les piles sont en bon état. »).

### Bon à savoir

- Les boutons propres aux widgets (**Tout ouvrir**/**Tout arrêter**/**Tout
  fermer**, **Position…**, **±0,5 °C**) vérifient d'abord le broker MQTT :
  s'il est déconnecté, un message le signale au lieu d'envoyer l'ordre.
- Les volets Tydom ne remontent que leur position : l'état « en mouvement »
  n'existe pas, la position s'actualise à l'arrêt du volet.

## Dépannage

- **Aucun appareil dans Découverte** : consultez les logs du sous-conteneur
  tydom2mqtt sur la page de l'intégration. `Connected to mqtt broker` et des
  appareils `created / updated` doivent apparaître. Une mauvaise adresse MAC
  ou un mauvais mot de passe se traduit par une erreur d'authentification
  auprès de la box.
- **« Broker MQTT injoignable »** : l'hôte doit être joignable depuis les
  conteneurs Gladys (IP locale, pas `localhost`), et l'utilisateur/mot de
  passe acceptés par le broker.
- **Les volets ne répondent plus (`ConnectionClosedOK` dans les logs de
  tydom2mqtt)** : la box Tydom a fermé sa connexion et tydom2mqtt ne s'est
  pas reconnecté. L'intégration le détecte (plus aucune réponse après une
  commande, ou un long silence) et redémarre tydom2mqtt automatiquement en
  moins d'une minute. Renvoyez la commande une fois les appareils remis à
  jour.
- **Un portail fait l'inverse de l'état affiché** : les portails sont pilotés
  par impulsions, l'état affiché est le dernier remonté par la box Tydom.

Passez `LOG_LEVEL=debug` pour le détail complet des logs de l'intégration.
