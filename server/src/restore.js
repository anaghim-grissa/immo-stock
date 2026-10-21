// Restaure une sauvegarde créée par backup.js : npm run restore -- <dossier>
// Attention : remplace entièrement le contenu actuel de la base.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import mongoose from 'mongoose';
import { connect, disconnect } from './db.js';

const dossier = process.argv[2] && resolve(process.argv[2]);
if (!dossier) {
  console.error('Usage : npm run restore -- <dossier de sauvegarde>');
  process.exit(1);
}
await connect();
for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json'))) {
  const col = mongoose.connection.db.collection(f.slice(0, -5));
  const docs = mongoose.mongo.BSON.EJSON.parse(readFileSync(join(dossier, f), 'utf8'), { relaxed: false });
  await col.deleteMany({});
  if (docs.length) await col.insertMany(docs);
  console.log(`${f.slice(0, -5)} : ${docs.length} document(s)`);
}
await disconnect();
console.log('Restauration terminée.');
