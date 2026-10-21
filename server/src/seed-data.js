// Données d'exemple (efface la base existante).
import { Lot, Client, Vente, User, Session } from './db.js';
import { hashPassword } from './auth.js';
import { genererEcheancier, todayISO } from './domain.js';

const mois = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return todayISO(d); };

export async function seed() {
  await Promise.all([Session, User, Vente, Client, Lot].map((m) => m.deleteMany({})));

  const lots = [];
  const typos = [['S+1', 72, 210000], ['S+2', 98, 285000], ['S+3', 126, 365000]];
  for (const bloc of ['A', 'B']) {
    for (let niv = 0; niv <= 3; niv++) {
      typos.forEach(([t, s, p], i) => lots.push({ ref: `${bloc}-${niv}0${i + 1}`, type: 'appartement', bloc, niveau: niv === 0 ? 'RDC' : `${niv}e étage`, typologie: t, surface: s, prix: p + niv * 6000 }));
    }
  }
  for (let i = 1; i <= 10; i++) lots.push({ ref: `C-${String(i).padStart(2, '0')}`, type: 'cellier', niveau: 'Sous-sol -1', surface: 6 + (i % 3) * 2, prix: 12000 + (i % 3) * 3000 });
  for (let i = 1; i <= 16; i++) lots.push({ ref: `P-${String(i).padStart(2, '0')}`, type: 'parking', niveau: i <= 8 ? 'Sous-sol -1' : 'Sous-sol -2', surface: 12.5, prix: 18000 });
  const b303 = lots.find((l) => l.ref === 'B-303');
  Object.assign(b303, { bloque: true, notes: 'Réservé promoteur' });
  const parRef = Object.fromEntries((await Lot.insertMany(lots)).map((l) => [l.ref, l]));

  const clients = await Client.insertMany([
    { nom: 'Exemple – Amine Ben Salah', cin: '08123456', tel: '+216 22 345 678', email: 'amine.exemple@mail.tn', adresse: 'Tunis' },
    { nom: 'Exemple – Sonia Trabelsi', cin: '07654321', tel: '+216 98 765 432', email: 'sonia.exemple@mail.tn', adresse: 'Ariana' },
    { nom: 'Exemple – Karim Jaziri', cin: '09887766', tel: '+216 55 112 233', email: 'karim.exemple@mail.tn', adresse: 'La Marsa' },
    { nom: 'Exemple – Leila Mansour', cin: '06554433', tel: '+216 21 908 070', email: 'leila.exemple@mail.tn', adresse: 'Sousse' },
  ]);

  // [client, refs, statut, signature (mois), acompte %, nb échéances, périodicité, nb échéances payées, paiement partiel de la suivante]
  const ventes = [
    [0, ['A-102', 'C-01', 'P-01'], 'vente', -8, 30, 8, 'mensuelle', 5, 0],
    [1, ['A-203', 'P-02'], 'vente', -6, 20, 4, 'trimestrielle', 2, 0.4],
    [2, ['B-101', 'C-02'], 'reservation', -3, 10, 12, 'mensuelle', 3, 0],
    [3, ['A-301', 'C-03', 'P-03'], 'vente', -1, 30, 6, 'mensuelle', 1, 0],
  ];
  for (const [ci, refs, statut, m, acompte, nb, per, nbPayees, partiel] of ventes) {
    const prix = refs.reduce((s, r) => s + parRef[r].prix, 0);
    const sig = mois(m);
    const lignes = genererEcheancier({ prixTotal: prix, acomptePct: acompte, nbEcheances: nb, periodicite: per, dateSignature: sig, datePremiere: mois(m + 1) });
    await Vente.create({
      client: clients[ci]._id, statut, prix_total: prix, date_signature: sig, lots: refs.map((r) => parRef[r]._id),
      echeances: lignes.map((l, i) => ({
        ...l,
        paiements: i < nbPayees ? [{ montant: l.montant, date_paiement: l.date_echeance, mode: i === 0 ? 'Chèque' : 'Virement' }]
          : i === nbPayees && partiel ? [{ montant: Math.round(l.montant * partiel), date_paiement: l.date_echeance, mode: 'Virement' }] : [],
      })),
    });
  }

  await User.create([
    { email: 'admin@societe.tn', nom: 'Service commercial', password_hash: hashPassword('admin123'), role: 'admin' },
    { email: 'amine.exemple@mail.tn', nom: 'Amine Ben Salah', password_hash: hashPassword('client123'), role: 'client', client: clients[0]._id },
  ]);
}
