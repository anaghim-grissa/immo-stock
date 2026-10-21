// Crée ou réinitialise un compte société : npm run create-admin -- email motdepasse "Nom"
import { connect, disconnect, User } from './db.js';
import { hashPassword } from './auth.js';

const [email, password, nom = 'Service commercial'] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Usage : npm run create-admin -- email motdepasse "Nom" (mot de passe : 8 caractères min.)');
  process.exit(1);
}
await connect();
await User.findOneAndUpdate(
  { email: email.toLowerCase().trim() },
  { $set: { nom, password_hash: hashPassword(password), role: 'admin' }, $unset: { client: 1 } },
  { upsert: true },
);
await disconnect();
console.log(`Compte société prêt : ${email}`);
