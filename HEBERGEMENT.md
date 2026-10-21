# Héberger l'application

## Quelle option choisir ?

| Option | Pour qui | Coût indicatif | Avis |
|---|---|---|---|
| **Serveur VPS (OVH, Hetzner…)** | Employés **et clients**, depuis partout | 5 à 10 € / mois + nom de domaine | **Recommandé** |
| PC/serveur dans les locaux | Employés uniquement, sur le réseau du bureau | Matériel existant | Simple, mais les clients ne peuvent pas se connecter de l'extérieur |
| Render / Railway | Employés et clients | 7 à 20 $ / mois | Possible, mais il faut payer un **disque persistant** sinon la base est effacée à chaque redémarrage |

Comme l'application a un espace client, il faut qu'elle soit accessible sur Internet : un **VPS** est le meilleur compromis (prix fixe, base SQLite conservée, vous gardez la main sur vos données).

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
apt install -y nodejs nginx unzip sqlite3
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
nano server/.env          # PORT=3001, réglages email (voir plus bas)
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
Toutes les données sont dans `server/data/immo.db`. Sauvegarde quotidienne à 2 h, 30 jours conservés :
```bash
su - immo
mkdir -p ~/sauvegardes
crontab -e
# ajouter la ligne :
0 2 * * * sqlite3 ~/immo-stock/server/data/immo.db ".backup '/home/immo/sauvegardes/immo-$(date +\%F).db'" && find ~/sauvegardes -name '*.db' -mtime +30 -delete
```
Copiez aussi régulièrement ces sauvegardes hors du serveur (Google Drive, disque de la société…). Les hébergeurs proposent souvent une option de sauvegarde automatique du VPS en plus.

### 8. Emails de relance (facultatif)
Dans `server/.env`, renseignez le serveur SMTP de votre messagerie (Gmail avec mot de passe d'application, Microsoft 365, ou un service comme Brevo) :
```
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=Service commercial <commercial@votresociete.tn>
ALERT_EMAIL=commercial@votresociete.tn
```
Puis `pm2 restart immo-stock`.

### Mettre à jour l'application
```bash
su - immo && cd immo-stock
# remplacer les fichiers par la nouvelle version (sans toucher à server/data ni server/.env)
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
