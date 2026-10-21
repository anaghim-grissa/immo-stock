// Données d'exemple (efface la base existante).
import { db, tx } from './db.js';
import { hashPassword } from './auth.js';
import { genererEcheancier, todayISO } from './domain.js';

const mois = (n) => { const d = new Date(); d.setMonth(d.getMonth() + n); return todayISO(d); };

export function seed() {
  tx(() => {
    db.exec('DELETE FROM sessions; DELETE FROM users; DELETE FROM relances; DELETE FROM paiements; DELETE FROM echeances; DELETE FROM vente_lots; DELETE FROM ventes; DELETE FROM clients; DELETE FROM lots;');

    const insLot = db.prepare('INSERT INTO lots (ref, type, bloc, niveau, typologie, surface, prix) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const lots = {};
    const typos = [['S+1', 72, 210000], ['S+2', 98, 285000], ['S+3', 126, 365000]];
    for (const bloc of ['A', 'B']) {
      for (let niv = 0; niv <= 3; niv++) {
        typos.forEach(([t, s, p], i) => {
          const ref = `${bloc}-${niv}0${i + 1}`;
          lots[ref] = Number(insLot.run(ref, 'appartement', bloc, niv === 0 ? 'RDC' : `${niv}e étage`, t, s, p + niv * 6000).lastInsertRowid);
        });
      }
    }
    for (let i = 1; i <= 10; i++) lots[`C-${String(i).padStart(2, '0')}`] = Number(insLot.run(`C-${String(i).padStart(2, '0')}`, 'cellier', null, 'Sous-sol -1', null, 6 + (i % 3) * 2, 12000 + (i % 3) * 3000).lastInsertRowid);
    for (let i = 1; i <= 16; i++) lots[`P-${String(i).padStart(2, '0')}`] = Number(insLot.run(`P-${String(i).padStart(2, '0')}`, 'parking', null, i <= 8 ? 'Sous-sol -1' : 'Sous-sol -2', null, 12.5, 18000).lastInsertRowid);
    db.prepare('UPDATE lots SET bloque = 1, notes = ? WHERE ref = ?').run('Réservé promoteur', 'B-303');

    const insClient = db.prepare('INSERT INTO clients (nom, cin, tel, email, adresse) VALUES (?, ?, ?, ?, ?)');
    const clients = [
      ['Exemple – Amine Ben Salah', '08123456', '+216 22 345 678', 'amine.exemple@mail.tn', 'Tunis'],
      ['Exemple – Sonia Trabelsi', '07654321', '+216 98 765 432', 'sonia.exemple@mail.tn', 'Ariana'],
      ['Exemple – Karim Jaziri', '09887766', '+216 55 112 233', 'karim.exemple@mail.tn', 'La Marsa'],
      ['Exemple – Leila Mansour', '06554433', '+216 21 908 070', 'leila.exemple@mail.tn', 'Sousse'],
    ].map((c) => Number(insClient.run(...c).lastInsertRowid));

    const prixLots = (refs) => refs.reduce((s, r) => s + db.prepare('SELECT prix FROM lots WHERE id = ?').get(lots[r]).prix, 0);
    const insVente = db.prepare('INSERT INTO ventes (client_id, statut, prix_total, date_signature) VALUES (?, ?, ?, ?)');
    const insVL = db.prepare('INSERT INTO vente_lots (vente_id, lot_id) VALUES (?, ?)');
    const insE = db.prepare('INSERT INTO echeances (vente_id, rang, libelle, date_echeance, montant) VALUES (?, ?, ?, ?, ?)');
    const insP = db.prepare('INSERT INTO paiements (echeance_id, montant, date_paiement, mode) VALUES (?, ?, ?, ?)');

    // [client, refs, statut, signature (mois), acompte %, nb échéances, périodicité, nb échéances payées, paiement partiel de la suivante]
    const ventes = [
      [0, ['A-102', 'C-01', 'P-01'], 'vente', -8, 30, 8, 'mensuelle', 5, 0],
      [1, ['A-203', 'P-02'], 'vente', -6, 20, 4, 'trimestrielle', 2, 0.4],
      [2, ['B-101', 'C-02'], 'reservation', -3, 10, 12, 'mensuelle', 3, 0],
      [3, ['A-301', 'C-03', 'P-03'], 'vente', -1, 30, 6, 'mensuelle', 1, 0],
    ];
    for (const [ci, refs, statut, m, acompte, nb, per, nbPayees, partiel] of ventes) {
      const prix = prixLots(refs);
      const sig = mois(m);
      const vid = Number(insVente.run(clients[ci], statut, prix, sig).lastInsertRowid);
      refs.forEach((r) => insVL.run(vid, lots[r]));
      const lignes = genererEcheancier({ prixTotal: prix, acomptePct: acompte, nbEcheances: nb, periodicite: per, dateSignature: sig, datePremiere: mois(m + 1) });
      lignes.forEach((l, i) => {
        const eid = Number(insE.run(vid, l.rang, l.libelle, l.date_echeance, l.montant).lastInsertRowid);
        if (i < nbPayees) insP.run(eid, l.montant, l.date_echeance, i === 0 ? 'Chèque' : 'Virement');
        else if (i === nbPayees && partiel) insP.run(eid, Math.round(l.montant * partiel), l.date_echeance, 'Virement');
      });
    }

    db.prepare(`INSERT INTO users (email, nom, password_hash, role) VALUES (?, ?, ?, 'admin')`).run('admin@societe.tn', 'Service commercial', hashPassword('admin123'));
    db.prepare(`INSERT INTO users (email, nom, password_hash, role, client_id) VALUES (?, ?, ?, 'client', ?)`).run('amine.exemple@mail.tn', 'Amine Ben Salah', hashPassword('client123'), clients[0]);
  });
}
