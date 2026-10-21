// Sauvegarde de la base : npm run backup -- [dossier] [jours à conserver]
// Exporte chaque collection en JSON étendu (types MongoDB conservés) dans un dossier daté.
// Pour restaurer : npm run restore -- <dossier de sauvegarde>
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { connect, disconnect } from './db.js';

const racine = resolve(process.argv[2] || process.env.BACKUP_DIR || fileURLToPath(new URL('../sauvegardes', import.meta.url)));
const jours = Number(process.argv[3] || process.env.BACKUP_JOURS || 30);

await connect();
const horodatage = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
const dossier = join(racine, `immo-${horodatage}`);
mkdirSync(dossier, { recursive: true });
for (const { name } of await mongoose.connection.db.listCollections().toArray()) {
  const docs = await mongoose.connection.db.collection(name).find().toArray();
  writeFileSync(join(dossier, `${name}.json`), mongoose.mongo.BSON.EJSON.stringify(docs, { relaxed: false }));
}
await disconnect();
console.log(`Sauvegarde créée : ${dossier}`);

const limite = Date.now() - jours * 86400000;
for (const f of readdirSync(racine)) {
  const p = join(racine, f);
  if (/^immo-/.test(f) && statSync(p).mtimeMs < limite) rmSync(p, { recursive: true, force: true });
}
