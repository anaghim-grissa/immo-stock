import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { api } from './routes.js';
import { connect, MONGODB_URI } from './db.js';
import { demarrerVerificationPeriodique } from './alertes.js';

const app = express();
app.use(express.json());
app.use('/api', api);
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Erreur serveur.' });
});

// En production, le serveur sert aussi l'interface React compilée.
const dist = fileURLToPath(new URL('../../client/dist', import.meta.url));
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (req, res) => res.sendFile(`${dist}/index.html`));
}

try {
  await connect();
} catch (e) {
  console.error(`Connexion à MongoDB impossible (${MONGODB_URI.replace(/\/\/[^@]*@/, '//***@')}) : ${e.message}`);
  process.exit(1);
}

const port = Number(process.env.PORT || 3001);
app.listen(port, () => {
  console.log(`API prête sur http://localhost:${port}`);
  demarrerVerificationPeriodique();
});
