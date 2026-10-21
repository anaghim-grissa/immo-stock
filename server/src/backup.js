// Sauvegarde de la base : node src/backup.js [dossier] [jours à conserver]
// Fonctionne sous Windows et Linux, sans outil externe (VACUUM INTO).
import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from './db.js';

const dossier = resolve(process.argv[2] || process.env.BACKUP_DIR || fileURLToPath(new URL('../sauvegardes', import.meta.url)));
const jours = Number(process.argv[3] || process.env.BACKUP_JOURS || 30);
mkdirSync(dossier, { recursive: true });

const horodatage = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const fichier = join(dossier, `immo-${horodatage}.db`);
db.exec(`VACUUM INTO '${fichier.replace(/'/g, "''")}'`);
console.log(`Sauvegarde créée : ${fichier}`);

const limite = Date.now() - jours * 86400000;
for (const f of readdirSync(dossier)) {
  const p = join(dossier, f);
  if (/^immo-.*\.db$/.test(f) && statSync(p).mtimeMs < limite) unlinkSync(p);
}
