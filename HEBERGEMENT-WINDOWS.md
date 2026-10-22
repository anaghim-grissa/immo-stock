# Héberger l'application sous Windows

Fonctionne sur **Windows Server 2019/2022** ou **Windows 10/11**, que ce soit un serveur loué (VPS Windows chez OVH, Contabo, Azure…) ou un PC du bureau toujours allumé.

| Où | Qui peut se connecter |
|---|---|
| **VPS Windows loué** (≈ 15 à 30 € / mois, licence Windows incluse) | Employés **et clients**, depuis partout. **Recommandé** si les clients utilisent leur espace. |
| PC Windows au bureau | Employés sur le réseau du bureau. Les clients seulement si vous ouvrez un port sur la box internet (déconseillé sans aide). |

Toutes les commandes ci-dessous se tapent dans **PowerShell lancé en tant qu'administrateur**.

---

## 1. Installer Node.js 22
Téléchargez l'installateur **LTS 22.x** (Windows Installer .msi) sur https://nodejs.org et installez-le avec les options par défaut. Vérifiez :
```powershell
node -v    # doit afficher v22.x
```

## 2. Installer MongoDB
Deux possibilités :

- **MongoDB sur le serveur** (recommandé si tout est au même endroit) : téléchargez **MongoDB Community Server** (Windows, .msi) sur https://www.mongodb.com/try/download/community et installez-le en laissant cochée l'option *Install MongoD as a Service*. Il démarre alors automatiquement avec Windows sur `mongodb://127.0.0.1:27017`. Vous pouvez aussi installer *MongoDB Compass* (proposé par l'installateur) pour consulter les données.
- **MongoDB Atlas** (base hébergée par MongoDB, offre gratuite pour démarrer) : créez un cluster sur https://www.mongodb.com/atlas, un utilisateur de base de données, autorisez l'adresse IP du serveur, puis copiez la chaîne de connexion `mongodb+srv://...`.

## 3. Installer l'application
Décompressez `immo-stock.zip` dans `C:\immo-stock`, puis :
```powershell
cd C:\immo-stock
npm run install:all
npm run build
copy server\.env.example server\.env
notepad server\.env        # MONGODB_URI si vous utilisez Atlas, réglages email (étape 8)
```

## 4. Créer le compte société
Ne lancez **pas** `npm run seed` (il efface la base et ajoute des données fictives).
```powershell
npm run create-admin -- direction@votresociete.tn "UnMotDePasseSolide" "Direction"
```
Test rapide : `npm start`, puis ouvrez http://localhost:3001 dans le navigateur. Arrêtez avec `Ctrl+C`.

## 5. Lancer l'application comme service Windows (démarre tout seul)
On utilise **NSSM**, un petit outil gratuit qui transforme un programme en service Windows.

1. Téléchargez NSSM sur https://nssm.cc/download, décompressez-le et copiez `win64\nssm.exe` dans `C:\immo-stock\outils\`.
2. Créez le service :
```powershell
$nssm = "C:\immo-stock\outils\nssm.exe"
$node = (Get-Command node).Source
& $nssm install ImmoStock $node "--env-file-if-exists=.env --no-warnings=ExperimentalWarning src\index.js"
& $nssm set ImmoStock AppDirectory C:\immo-stock\server
& $nssm set ImmoStock DisplayName "Folla Immobiliere"
& $nssm set ImmoStock Start SERVICE_AUTO_START
& $nssm set ImmoStock DependOnService MongoDB      # seulement si MongoDB est installé sur ce serveur
New-Item -ItemType Directory -Force C:\immo-stock\logs | Out-Null
& $nssm set ImmoStock AppStdout C:\immo-stock\logs\app.log
& $nssm set ImmoStock AppStderr C:\immo-stock\logs\erreurs.log
Start-Service ImmoStock
```
L'application tourne maintenant en permanence sur le port 3001, même après un redémarrage du serveur. Commandes utiles : `Restart-Service ImmoStock`, `Stop-Service ImmoStock`.

## 6a. Accès depuis le réseau du bureau (PC au bureau)
```powershell
New-NetFirewallRule -DisplayName "Folla Immobiliere" -Direction Inbound -Protocol TCP -LocalPort 3001 -Action Allow -Profile Private,Domain
ipconfig     # notez l'« Adresse IPv4 », par ex. 192.168.1.20
```
Les employés ouvrent **http://192.168.1.20:3001**. Demandez à votre informaticien de donner une adresse IP fixe à ce PC.

## 6b. Accès depuis Internet avec HTTPS (VPS ou clients)
On utilise **Caddy**, un serveur web gratuit qui obtient et renouvelle tout seul le certificat HTTPS.

1. Chez votre registrar, créez un enregistrement **A** : `stock.votresociete.tn` → adresse IP publique du serveur.
2. Téléchargez Caddy pour Windows (amd64) sur https://caddyserver.com/download, renommez-le `caddy.exe` et placez-le dans `C:\immo-stock\outils\`.
3. Créez le fichier `C:\immo-stock\outils\Caddyfile` avec ce contenu :
```
stock.votresociete.tn {
    reverse_proxy 127.0.0.1:3001
}
```
4. Installez Caddy comme service et ouvrez les ports web :
```powershell
$nssm = "C:\immo-stock\outils\nssm.exe"
& $nssm install Caddy C:\immo-stock\outils\caddy.exe "run --config C:\immo-stock\outils\Caddyfile"
& $nssm set Caddy AppDirectory C:\immo-stock\outils
& $nssm set Caddy Start SERVICE_AUTO_START
Start-Service Caddy
New-NetFirewallRule -DisplayName "Web HTTP"  -Direction Inbound -Protocol TCP -LocalPort 80  -Action Allow
New-NetFirewallRule -DisplayName "Web HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```
L'application est disponible sur **https://stock.votresociete.tn** pour vos employés et vos clients. Le port 3001 n'a pas besoin d'être ouvert vers Internet.

Si le serveur est un PC au bureau, il faut en plus rediriger les ports 80 et 443 de la box internet vers ce PC, et avoir une IP publique fixe. Un VPS évite ces réglages.

## 7. Sauvegarde automatique chaque nuit (indispensable)
Les données sont dans MongoDB. Cette tâche planifiée exporte toute la base chaque nuit à 2 h dans `C:\immo-stock\sauvegardes` (un dossier daté par sauvegarde) et garde 30 jours :
```powershell
$node = (Get-Command node).Source
$action  = New-ScheduledTaskAction -Execute $node -Argument "--env-file-if-exists=.env src\backup.js C:\immo-stock\sauvegardes 30" -WorkingDirectory C:\immo-stock\server
$trigger = New-ScheduledTaskTrigger -Daily -At 2am
Register-ScheduledTask -TaskName "Sauvegarde Folla Immobiliere" -Action $action -Trigger $trigger -User "SYSTEM" -RunLevel Highest
Start-ScheduledTask -TaskName "Sauvegarde Folla Immobiliere"   # premier essai tout de suite
dir C:\immo-stock\sauvegardes
```
Copiez aussi ce dossier ailleurs (OneDrive, Google Drive, disque externe) : si le serveur tombe en panne, ce sont vos seules données. Avec MongoDB Atlas, activez en plus les sauvegardes automatiques d'Atlas.

**Restaurer une sauvegarde** (remplace tout le contenu actuel) :
```powershell
Stop-Service ImmoStock
cd C:\immo-stock
npm run restore -- C:\immo-stock\sauvegardes\immo-2026-10-21-02-00-00
Start-Service ImmoStock
```

## 8. Emails de relance
Le serveur vérifie les échéances toutes les 6 heures. Pour chaque client en retard, il envoie **un seul email** qui regroupe toutes ses échéances impayées, avec une copie à la société (`ALERT_EMAIL`). Un même client n'est pas relancé plus d'une fois tous les 7 jours (réglable avec `INTERVALLE_RELANCE_JOURS`). Le bouton « Relancer » du tableau de bord permet aussi d'envoyer un email immédiatement.

Renseignez la messagerie qui envoie les emails dans `server/.env`, puis redémarrez l'application (`Restart-Service ImmoStock`).

**Gmail ou Google Workspace** : activez la validation en deux étapes sur le compte, puis créez un *mot de passe d'application* (Compte Google → Sécurité → Mots de passe des applications). Utilisez ce mot de passe de 16 caractères, pas le mot de passe habituel.
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre.adresse@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM=Folla Immobilière <votre.adresse@gmail.com>
ALERT_EMAIL=commercial@votresociete.tn
```

**Microsoft 365 / Outlook** : `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, avec l'adresse et le mot de passe de la boîte d'envoi. L'administrateur doit autoriser « SMTP authentifié » pour cette boîte.

**Messagerie de votre hébergeur de domaine** (OVH, etc.) : utilisez les paramètres SMTP qu'il fournit. Avec le port 465, ajoutez `SMTP_SECURE=true`.

Pour vérifier les réglages, envoyez-vous un email de test :
```
npm run test-email -- votre.adresse@exemple.com
```

Si un envoi échoue (mot de passe incorrect, serveur injoignable), l'erreur s'affiche dans les journaux de l'application et l'envoi est retenté à la vérification suivante.

## Mettre à jour l'application
```powershell
Stop-Service ImmoStock
# remplacer les fichiers de C:\immo-stock par la nouvelle version
# SANS toucher à server\.env, sauvegardes et outils
cd C:\immo-stock
npm run install:all
npm run build
Start-Service ImmoStock
```

## Avant la mise en ligne
- Mots de passe solides pour tous les comptes société.
- HTTPS obligatoire (étape 6b) dès que des clients se connectent depuis Internet.
- Vérifiez une fois qu'une sauvegarde se restaure correctement.
- Gardez Windows à jour (Windows Update).
