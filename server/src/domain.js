// Règles métier : statut des lots, état des échéances, génération d'échéancier.
import { db } from './db.js';

export const JOURS_ALERTE_PROCHE = Number(process.env.JOURS_ALERTE_PROCHE || 7);

export function todayISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);
}

function addMonths(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

const round3 = (x) => Math.round(x * 1000) / 1000;

/** Échéancier : un acompte à la signature puis N échéances égales (la dernière absorbe l'arrondi). */
export function genererEcheancier({ prixTotal, acomptePct = 0, nbEcheances = 1, periodicite = 'mensuelle', dateSignature, datePremiere }) {
  const pas = { mensuelle: 1, trimestrielle: 3, semestrielle: 6 }[periodicite] || 1;
  const lignes = [];
  const acompte = round3((prixTotal * acomptePct) / 100);
  if (acompte > 0) lignes.push({ libelle: 'Acompte à la signature', date_echeance: dateSignature, montant: acompte });
  const reste = round3(prixTotal - acompte);
  const n = Math.max(1, Math.floor(nbEcheances));
  const base = Math.floor((reste / n) * 1000) / 1000;
  for (let i = 0; i < n; i++) {
    const montant = i === n - 1 ? round3(reste - base * (n - 1)) : base;
    lignes.push({ libelle: `Échéance ${i + 1}/${n}`, date_echeance: datePremiere ? addMonths(datePremiere, i * pas) : addMonths(dateSignature, (i + 1) * pas), montant });
  }
  return lignes.map((l, i) => ({ ...l, rang: i + 1 }));
}

export function etatEcheance(e, today = todayISO()) {
  const reste = round3(e.montant - (e.montant_paye || 0));
  if (reste <= 0.0005) return { etat: 'payee', reste: 0, jours: 0 };
  const jours = daysBetween(e.date_echeance, today);
  if (jours > 0) return { etat: 'retard', reste, jours };
  if (-jours <= JOURS_ALERTE_PROCHE) return { etat: 'proche', reste, jours: -jours };
  return { etat: 'a_venir', reste, jours: -jours };
}

const ECHEANCES_SQL = `
  SELECT e.*, COALESCE((SELECT SUM(p.montant) FROM paiements p WHERE p.echeance_id = e.id), 0) AS montant_paye,
         (SELECT MAX(p.date_paiement) FROM paiements p WHERE p.echeance_id = e.id) AS dernier_paiement
  FROM echeances e`;

export function echeancesDeVente(venteId) {
  return db.prepare(`${ECHEANCES_SQL} WHERE e.vente_id = ? ORDER BY e.rang`).all(venteId)
    .map((e) => ({ ...e, ...etatEcheance(e) }));
}

export function lotsDeVente(venteId) {
  return db.prepare(`SELECT l.* FROM lots l JOIN vente_lots vl ON vl.lot_id = l.id WHERE vl.vente_id = ? ORDER BY l.type, l.ref`).all(venteId);
}

export function venteComplete(v) {
  const echeances = echeancesDeVente(v.id);
  const paye = round3(echeances.reduce((s, e) => s + e.montant_paye, 0));
  const enRetard = echeances.filter((e) => e.etat === 'retard');
  const prochaine = echeances.find((e) => e.etat !== 'payee') || null;
  return {
    ...v,
    lots: lotsDeVente(v.id),
    echeances,
    total_paye: paye,
    reste_a_payer: round3(v.prix_total - paye),
    montant_en_retard: round3(enRetard.reduce((s, e) => s + e.reste, 0)),
    nb_retard: enRetard.length,
    prochaine_echeance: prochaine,
  };
}

/** Lots avec statut dérivé : disponible, bloqué, réservé ou vendu. */
export function listerLots() {
  return db.prepare(`
    SELECT l.*, v.id AS vente_id, v.statut AS vente_statut, c.id AS client_id, c.nom AS client_nom
    FROM lots l
    LEFT JOIN vente_lots vl ON vl.lot_id = l.id
    LEFT JOIN ventes v ON v.id = vl.vente_id
    LEFT JOIN clients c ON c.id = v.client_id
    ORDER BY l.type, l.bloc, l.ref`).all()
    .map((l) => ({
      ...l,
      statut: l.vente_id ? (l.vente_statut === 'vente' ? 'vendu' : 'reserve') : l.bloque ? 'bloque' : 'disponible',
    }));
}

/** Échéances impayées en retard ou proches, avec client et lots. */
export function listerAlertes() {
  const rows = db.prepare(`
    ${ECHEANCES_SQL.replace('FROM echeances e', `, v.client_id, c.nom AS client_nom, c.tel AS client_tel, c.email AS client_email
    FROM echeances e JOIN ventes v ON v.id = e.vente_id JOIN clients c ON c.id = v.client_id`)}
    ORDER BY e.date_echeance`).all();
  return rows
    .map((e) => ({ ...e, ...etatEcheance(e) }))
    .filter((e) => e.etat === 'retard' || e.etat === 'proche')
    .map((e) => ({
      ...e,
      lots: lotsDeVente(e.vente_id).map((l) => l.ref),
      derniere_relance: db.prepare('SELECT MAX(envoye_le) AS d FROM relances WHERE echeance_id = ?').get(e.id).d,
    }))
    .sort((a, b) => (a.etat === b.etat ? (a.etat === 'retard' ? b.jours - a.jours : a.jours - b.jours) : a.etat === 'retard' ? -1 : 1));
}

export function messageRelance(a) {
  const montant = Number(a.reste).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const date = a.date_echeance.split('-').reverse().join('/');
  return `Bonjour ${a.client_nom},\n\nSauf erreur de notre part, l'échéance « ${a.libelle} » de ${montant} DT prévue le ${date} pour ${a.lots.length > 1 ? 'les lots' : 'le lot'} ${a.lots.join(', ')} reste impayée à ce jour (${a.jours} jour${a.jours > 1 ? 's' : ''} de retard).\n\nMerci de bien vouloir régulariser votre situation ou de nous contacter.\n\nCordialement,\nLe service commercial`;
}
