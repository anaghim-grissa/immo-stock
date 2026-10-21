// Crée un client de test avec un dossier ayant une échéance en retard, pour essayer les relances :
//   npm run client-test -- adresse@exemple.com "Nom du client"
// Ne supprime rien : le client et le dossier s'ajoutent aux données existantes.
import { connect, disconnect, Lot, Client, Vente } from './db.js';
import { genererEcheancier, todayISO } from './domain.js';

const [email, nom = 'Client de test'] = process.argv.slice(2);
if (!email) {
  console.error('Usage : npm run client-test -- adresse@exemple.com "Nom du client"');
  process.exit(1);
}

const mois = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return todayISO(d); };

await connect();
const pris = new Set((await Vente.find({}, { lots: 1 }).lean()).flatMap((v) => v.lots.map(String)));
const lot = (await Lot.find({ type: 'appartement', bloque: false }).sort({ ref: 1 }).lean()).find((l) => !pris.has(String(l._id)));
if (!lot) {
  console.error('Aucun appartement disponible : ajoutez un lot dans la page Stock puis relancez la commande.');
  await disconnect();
  process.exit(1);
}

const client = await Client.create({ nom: `Test – ${nom}`, email, tel: '' });
const sig = mois(-2);
const lignes = genererEcheancier({ prixTotal: lot.prix, acomptePct: 30, nbEcheances: 12, periodicite: 'mensuelle', dateSignature: sig, datePremiere: mois(-1) });
await Vente.create({
  client: client._id, statut: 'vente', prix_total: lot.prix, date_signature: sig, date_vente: sig, lots: [lot._id],
  notes: 'Dossier de test pour essayer les relances',
  // Acompte payé, première échéance (il y a un mois) impayée : elle apparaît en retard.
  echeances: lignes.map((l, i) => ({ ...l, paiements: i === 0 ? [{ montant: l.montant, date_paiement: sig, mode: 'Virement' }] : [] })),
});
await disconnect();

console.log(`Client « Test – ${nom} » (${email}) créé avec le lot ${lot.ref} et une échéance en retard.`);
console.log('Ouvrez le Tableau de bord, cliquez sur « Relancer » sur sa ligne puis « Envoyer par email ».');
console.log('Sans clic, la relance automatique part au prochain démarrage du serveur ou dans les 6 heures.');
