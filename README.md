# Folla Immobilière

Application web entre la société et ses clients pour gérer le stock de **appartements, celliers et places de parking**, les réservations/ventes, les **échéanciers de paiement**, et **alerter quand une échéance est dépassée et impayée**.

- **Serveur** : Node.js 22 + Express, base **MongoDB** (Mongoose). Fonctionne avec un MongoDB installé sur le serveur ou avec MongoDB Atlas.
- **Interface** : React 18 + Vite.

## Démarrage rapide

Prérequis : Node.js 22.9 ou plus et un MongoDB accessible. Par défaut l'application utilise `mongodb://127.0.0.1:27017/immo-stock` ; pour une autre adresse (Atlas…), copiez `server/.env.example` en `server/.env` et renseignez `MONGODB_URI`.

```bash
npm run install:all     # installe server/ et client/
npm run seed            # crée la base avec des données d'exemple (efface l'existant)

# développement (2 terminaux)
npm run dev:server      # API sur http://localhost:3001
npm run dev:client      # interface sur http://localhost:5173

# production
npm run build && npm start   # tout sur http://localhost:3001
```

Comptes d'exemple créés par `npm run seed` :

| Rôle | Email | Mot de passe |
|---|---|---|
| Société | admin@societe.tn | admin123 |
| Client | amine.exemple@mail.tn | client123 |

Pour la mise en ligne, suivez [HEBERGEMENT-WINDOWS.md](HEBERGEMENT-WINDOWS.md) (Windows) ou [HEBERGEMENT.md](HEBERGEMENT.md) (Linux).

## Fonctionnalités

**Espace société**
- *Objectifs* : nombre d'appartements vendus dans le mois face à l'objectif fixé par la société (modifiable dans l'application, repris d'un mois sur l'autre tant qu'il n'est pas changé), chiffre d'affaires signé, celliers et parkings vendus, historique sur 6 mois. Une vente compte dans le mois où le dossier passe en vente ferme.
- *Tableau de bord* : montants encaissés, reste à encaisser, montant en retard, disponibilité du stock par type, et liste des **alertes** (échéances en retard, puis échéances dues sous 7 jours).
- *Relance* : message de relance pré-rédigé (copier pour SMS/WhatsApp) ou envoi par email.
- *Stock* : plan des lots par bloc et niveau, couleur selon le statut (disponible, réservé, vendu, bloqué). Ajout, modification, blocage.
- *Ventes & échéances* : création d'un dossier (réservation ou vente ferme) regroupant plusieurs lots (ex. appartement + cellier + parking), génération automatique de l'échéancier (acompte % + N échéances mensuelles/trimestrielles/semestrielles), encaissement total ou partiel, historique des paiements, annulation du dossier (libère les lots).
- *Clients* : fiche client, montant en retard, création de l'accès à l'espace client.

**Espace client** : le client voit ses lots, son échéancier, ce qu'il a payé, ce qui reste, et une alerte s'il est en retard.

## Alertes

Une échéance est **en retard** quand sa date est passée et qu'elle n'est pas entièrement payée.

- Toujours visibles dans le tableau de bord et l'espace client.
- Le serveur vérifie automatiquement toutes les 6 h. Si l'email est configuré (`server/.env`, voir `.env.example`), il envoie à chaque client en retard **un seul email** regroupant ses échéances impayées (copie à `ALERT_EMAIL`), au plus une fois tous les 7 jours. Un envoi en échec est retenté à la vérification suivante. Sans email configuré, la relance est seulement journalisée. Réglages Gmail / Microsoft 365 : voir les guides d'hébergement.

### Tester les relances par email
1. Renseignez la messagerie dans `server/.env` (voir les guides d'hébergement, section emails).
2. `npm run test-email -- votre.adresse@exemple.com` vérifie l'envoi.
3. `npm run client-test -- votre.adresse@exemple.com "Votre nom"` crée un client de test avec une échéance en retard. Dans le Tableau de bord, cliquez sur « Relancer » sur sa ligne, puis « Envoyer par email ».

## Données (MongoDB)

| Collection | Contenu |
|---|---|
| `lots` | appartements, celliers, places de parking (référence unique, prix, blocage) |
| `clients` | fiches clients |
| `ventes` | dossiers : client, lots, statut, et l'échéancier intégré (`echeances[]`, chacune avec ses `paiements[]` et `relances[]`) |
| `objectifs` | objectif d'appartements vendus par mois (`mois` au format AAAA-MM) |
| `users` | comptes société et clients |
| `sessions` | connexions en cours (expirent après 30 jours) |

Un index unique sur `ventes.lots` empêche qu'un lot soit dans deux dossiers.

## Structure

```
server/src/db.js        connexion MongoDB et modèles Mongoose
server/src/domain.js    règles : statut des lots, état des échéances, échéancier
server/src/routes.js    API REST (/api/...)
server/src/alertes.js   vérification périodique + emails
server/src/seed.js      données d'exemple
server/src/backup.js    sauvegarde (npm run backup) / restore.js (npm run restore)
client/src/pages/       Tableau, Stock, Ventes, Clients, Portail (espace client)
```

## Limites du prototype

- Authentification simple par jeton ; prévoir HTTPS, expiration des sessions et changement de mot de passe avant production.
- Un seul compte société ; pas encore de gestion fine des rôles (commercial, comptable…).
- Pas d'envoi SMS intégré (le message est prêt à copier) ; un fournisseur SMS peut être branché dans `alertes.js`.
- Montants en dinars (DT), 3 décimales.
