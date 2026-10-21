# Héberger l'application

## Quelle option choisir ?

| Option | Pour qui | Coût indicatif | Avis |
|---|---|---|---|
| **Serveur VPS (OVH, Hetzner…)** | Employés **et clients**, depuis partout | 5 à 10 € / mois + nom de domaine | **Recommandé** |
| PC/serveur dans les locaux | Employés uniquement, sur le réseau du bureau | Matériel existant | Simple, mais les clients ne peuvent pas se connecter de l'extérieur |
| Render / Railway + MongoDB Atlas | Employés et clients | 7 à 20 $ / mois | Possible : l'application chez Render/Railway, la base chez Atlas |

Comme l'application a un espace client, il faut qu'elle soit accessible sur Internet : un **VPS** est le meilleur compromis (prix fixe, MongoDB sur le même serveur, vous gardez la main sur vos données).

---

## Installation sur un VPS (Ubuntu 24.04)

Ce qu'il vous faut : un VPS Ubuntu (ex. OVH VPS Starter, Hetzner CX22), un nom de domaine (ex. `stock.votresociete.tn`) et un accès SSH.

### 1. Pointer le domaine vers le serveur
Chez votre registrar, créez un enregistrement **A** : `stock.votresociete.tn` → adresse IP du VPS.

### 2. Préparer le serveur
```bash
ssh root@IP_DU_VPS
apt update && apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs nginx unzip gnupg
# MongoDB 8 (dépôt officiel)
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt update && apt install -y mongodb-org
systemctl enable --now mongod
npm install -g pm2
adduser --disabled-password --gecos "" immo
```

### 3. Copier et installer l'application
Depuis votre ordinateur :
```bash
scp immo-stock.zip root@IP_DU_VPS:/home/immo/
```
Sur le serveur :
```bash
su - immo
unzip immo-stock.zip && cd immo-stock
npm run install:all
npm run build
cp server/.env.example server/.env
nano server/.env          # PORT, MONGODB_URI (si Atlas), réglages email (voir plus bas)
```

### 4. Créer le compte société (sans données d'exemple)
Ne lancez **pas** `npm run seed` en production : il efface la base et met des données fictives.
```bash
npm run create-admin -- direction@votresociete.tn "UnMotDePasseSolide" "Direction"
```
Les comptes des clients se créent ensuite depuis l'application (page Clients → « Créer l'accès »).

### 5. Lancer l'application en permanence
```bash
pm2 start npm --name immo-stock -- start
pm2 save
exit                      # revenir en root
pm2 startup systemd -u immo --hp /home/immo   # redémarrage automatique du serveur
```

### 6. Nginx + HTTPS
```bash
cat > /etc/nginx/sites-available/immo-stock <<'EOF'
server {
  server_name stock.votresociete.tn;
  location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
EOF
ln -s /etc/nginx/sites-available/immo-stock /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
apt install -y certbot python3-certbot-nginx
certbot --nginx -d stock.votresociete.tn
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw enable
```
L'application est alors disponible sur **https://stock.votresociete.tn** pour vos employés et vos clients.

### 7. Sauvegardes (indispensable)
Les données sont dans MongoDB. Sauvegarde quotidienne à 2 h, 30 jours conservés :
```bash
su - immo
crontab -e
# ajouter la ligne :
0 2 * * * cd ~/immo-stock/server && /usr/bin/node --env-file-if-exists=.env src/backup.js /home/immo/sauvegardes 30
```
Restauration (remplace tout le contenu actuel) : `pm2 stop immo-stock && npm run restore -- /home/immo/sauvegardes/immo-AAAA-MM-JJ-... && pm2 start immo-stock`.

Copiez aussi régulièrement ces sauvegardes hors du serveur (Google Drive, disque de la société…).

### 8. Emails de relance
Le serveur vérifie les échéances toutes les 6 heures. Pour chaque client en retard, il envoie **un seul email** qui regroupe toutes ses échéances impayées, avec une copie à la société (`ALERT_EMAIL`). Un même client n'est pas relancé plus d'une fois tous les 7 jours (réglable avec `INTERVALLE_RELANCE_JOURS`). Le bouton « Relancer » du tableau de bord permet aussi d'envoyer un email immédiatement.

Renseignez la messagerie qui envoie les emails dans `server/.env`, puis redémarrez l'application (`pm2 restart immo-stock`).

**Gmail ou Google Workspace** : activez la validation en deux étapes sur le compte, puis créez un *mot de passe d'application* (Compte Google → Sécurité → Mots de passe des applications). Utilisez ce mot de passe de 16 caractères, pas le mot de passe habituel.
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre.adresse@gmail.com
SMTP_PASS=abcdefghijklmnop
SMTP_FROM=Service commercial <votre.adresse@gmail.com>
ALERT_EMAIL=commercial@votresociete.tn
```

**Microsoft 365 / Outlook** : `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, avec l'adresse et le mot de passe de la boîte d'envoi. L'administrateur doit autoriser « SMTP authentifié » pour cette boîte.

**Messagerie de votre hébergeur de domaine** (OVH, etc.) : utilisez les paramètres SMTP qu'il fournit. Avec le port 465, ajoutez `SMTP_SECURE=true`.

Si un envoi échoue (mot de passe incorrect, serveur injoignable), l'erreur s'affiche dans les journaux de l'application et l'envoi est retenté à la vérification suivante.

### Mettre à jour l'application
```bash
su - immo && cd immo-stock
# remplacer les fichiers par la nouvelle version (sans toucher à server/.env)
npm run install:all && npm run build && pm2 restart immo-stock
```

---

## Variante : serveur dans les locaux (employés seulement)

Sur un PC toujours allumé du bureau (Windows ou Linux) avec Node 22 :
```bash
npm run install:all && npm run build
npm run create-admin -- direction@votresociete.tn "UnMotDePasseSolide"
npm start
```
Les employés ouvrent `http://IP_DU_PC:3001` depuis le réseau du bureau (autoriser le port 3001 dans le pare-feu). Pour un démarrage automatique sous Windows, utilisez `pm2` avec `pm2-windows-startup`. Les clients n'y auront pas accès depuis chez eux.

## Avant la mise en ligne
- Mots de passe solides pour tous les comptes société.
- HTTPS obligatoire (étape 6) puisque des clients se connectent.
- Vérifier que les sauvegardes fonctionnent en restaurant une copie une première fois.
