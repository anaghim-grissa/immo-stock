// Crée un client de test avec un dossier ayant une échéance en retard, pour essayer les relances :
//   npm run client-test -- adresse@exemple.com "Nom du client"
// Ne supprime rien : le client et le dossier s'ajoutent aux données existantes.
import { connect, disconnect } from './db.js';
import { creerClientTest } from './client-test-data.js';

const [email, nom = 'Client de test'] = process.argv.slice(2);
if (!email) {
  console.error('Usage : npm run client-test -- adresse@exemple.com "Nom du client"');
  process.exit(1);
}

await connect();
const lot = await creerClientTest(email, nom);
await disconnect();
if (!lot) {
  console.error('Aucun appartement disponible : ajoutez un lot dans la page Stock puis relancez la commande.');
  process.exit(1);
}

console.log(`Client « Test – ${nom} » (${email}) créé avec le lot ${lot.ref} et une échéance en retard.`);
console.log('Ouvrez le Tableau de bord, cliquez sur « Relancer » sur sa ligne puis « Envoyer par email ».');
console.log('Sans clic, la relance automatique part au prochain démarrage du serveur ou dans les 6 heures.');
