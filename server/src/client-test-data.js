// Client de test avec un dossier dont une échéance est en retard (pour essayer les relances).
import { Lot, Client, Vente } from './db.js';
import { genererEcheancier, todayISO } from './domain.js';

const mois = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return todayISO(d); };

/** Retourne le lot utilisé, ou null s'il n'y a plus d'appartement disponible. */
export async function creerClientTest(email, nom) {
  const pris = new Set((await Vente.find({}, { lots: 1 }).lean()).flatMap((v) => v.lots.map(String)));
  const lot = (await Lot.find({ type: 'appartement', bloque: false }).sort({ ref: 1 }).lean()).find((l) => !pris.has(String(l._id)));
  if (!lot) return null;

  const client = await Client.create({ nom: `Test – ${nom}`, email, tel: '' });
  const sig = mois(-2);
  const lignes = genererEcheancier({ prixTotal: lot.prix, acomptePct: 30, nbEcheances: 12, periodicite: 'mensuelle', dateSignature: sig, datePremiere: mois(-1) });
  await Vente.create({
    client: client._id, statut: 'vente', prix_total: lot.prix, date_signature: sig, date_vente: sig, lots: [lot._id],
    notes: 'Dossier de test pour essayer les relances',
    // Acompte payé, première échéance (il y a un mois) impayée : elle apparaît en retard.
    echeances: lignes.map((l, i) => ({ ...l, paiements: i === 0 ? [{ montant: l.montant, date_paiement: sig, mode: 'Virement' }] : [] })),
  });
  return lot;
}
