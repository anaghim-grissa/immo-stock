// Données d'exemple : npm run seed (efface la base existante).
import { connect, disconnect } from './db.js';
import { seed } from './seed-data.js';

await connect();
await seed();
await disconnect();

console.log('Base initialisée avec des données d\'exemple.');
console.log('  Société : admin@societe.tn / admin123');
console.log('  Client  : amine.exemple@mail.tn / client123');
