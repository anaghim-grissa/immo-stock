// Crée ou réinitialise un compte société : node src/create-admin.js email motdepasse "Nom"
import { db } from './db.js';
import { hashPassword } from './auth.js';

const [email, password, nom = 'Service commercial'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage : npm run create-admin -- email motdepasse "Nom" (mot de passe : 8 caractères min.)');
  process.exit(1);
}
const existant = db.prepare('SELECT id FROM users WHERE lower(email) = lower(?)').get(email);
if (existant) db.prepare(`UPDATE users SET password_hash = ?, nom = ?, role = 'admin', client_id = NULL WHERE id = ?`).run(hashPassword(password), nom, existant.id);
else db.prepare(`INSERT INTO users (email, nom, password_hash, role) VALUES (?, ?, ?, 'admin')`).run(email, nom, hashPassword(password));
console.log(`Compte société prêt : ${email}`);
