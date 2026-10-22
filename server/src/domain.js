// Règles métier : statut des lots, état des échéances, génération d'échéancier.
import { Lot, Vente } from './db.js';

export const JOURS_ALERTE_PROCHE = Number(process.env.JOURS_ALERTE_PROCHE || 7);
// Toutes les échéances tombent le même jour du mois, pour tous les clients.
export const JOUR_RAPPEL = Math.min(28, Math.max(1, Number(process.env.JOUR_RAPPEL || 1)));
export const JOUR_ECHEANCE = Math.min(28, Math.max(1, Number(process.env.JOUR_ECHEANCE || 10)));

export function todayISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}

export function daysBetween(fromISO, toISO) {
  return Math.round((Date.parse(toISO) - Date.parse(fromISO)) / 86400000);
}

export const round3 = (x) => Math.round(x * 1000) / 1000;

/** Le JOUR_ECHEANCE du mois de `iso` (AAAA-MM ou AAAA-MM-JJ), décalé de `n` mois. */
function jourEcheance(iso, n = 0) {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, JOUR_ECHEANCE));
  return d.toISOString().slice(0, 10);
}

/**
 * Échéancier : un acompte à la signature puis N échéances égales (la dernière absorbe l'arrondi).
 * Chaque échéance tombe le JOUR_ECHEANCE du mois (le 10 par défaut) : par défaut la première
 * est le mois qui suit la signature, ou le mois choisi dans `datePremiere`.
 */
export function genererEcheancier({ prixTotal, acomptePct = 0, nbEcheances = 1, periodicite = 'mensuelle', dateSignature, datePremiere }) {
  const pas = { mensuelle: 1, trimestrielle: 3, semestrielle: 6 }[periodicite] || 1;
  const lignes = [];
  const acompte = round3((prixTotal * acomptePct) / 100);
  if (acompte > 0) lignes.push({ libelle: 'Acompte à la signature', date_echeance: dateSignature, montant: acompte });
  const reste = round3(prixTotal - acompte);
  const n = Math.max(1, Math.floor(nbEcheances));
  const base = Math.floor((reste / n) * 1000) / 1000;
  const premiere = datePremiere ? jourEcheance(datePremiere) : jourEcheance(dateSignature, 1);
  for (let i = 0; i < n; i++) {
    const montant = i === n - 1 ? round3(reste - base * (n - 1)) : base;
    lignes.push({ libelle: `Échéance ${i + 1}/${n}`, date_echeance: jourEcheance(premiere, i * pas), montant });
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

/* ---------- Mise en forme des documents pour l'API ---------- */

export const lotJSON = (l) => ({
  id: String(l._id), ref: l.ref, type: l.type, bloc: l.bloc ?? null, niveau: l.niveau ?? null, typologie: l.typologie ?? null,
  surface: l.surface ?? null, prix: l.prix, bloque: !!l.bloque, notes: l.notes ?? null,
});

export function echeanceJSON(e) {
  const montant_paye = round3((e.paiements || []).reduce((s, p) => s + p.montant, 0));
  const derniere = (e.relances || []).reduce((d, r) => (!d || r.envoye_le > d ? r.envoye_le : d), null);
  const base = {
    id: String(e._id), rang: e.rang, libelle: e.libelle, date_echeance: e.date_echeance, montant: e.montant, montant_paye,
    derniere_relance: derniere ? derniere.toISOString() : null,
  };
  return { ...base, ...etatEcheance(base) };
}

/** Dossier complet ; `v` doit avoir `lots` et `client` peuplés. */
export function venteJSON(v) {
  const echeances = [...v.echeances].sort((a, b) => a.rang - b.rang).map(echeanceJSON);
  const paye = round3(echeances.reduce((s, e) => s + e.montant_paye, 0));
  const enRetard = echeances.filter((e) => e.etat === 'retard');
  return {
    id: String(v._id),
    client_id: String(v.client?._id ?? v.client),
    client_nom: v.client?.nom,
    client_tel: v.client?.tel,
    client_email: v.client?.email,
    statut: v.statut,
    prix_total: v.prix_total,
    date_signature: v.date_signature,
    notes: v.notes ?? null,
    lots: v.lots.map(lotJSON).sort((a, b) => a.type.localeCompare(b.type) || a.ref.localeCompare(b.ref)),
    echeances,
    total_paye: paye,
    reste_a_payer: round3(v.prix_total - paye),
    montant_en_retard: round3(enRetard.reduce((s, e) => s + e.reste, 0)),
    nb_retard: enRetard.length,
    prochaine_echeance: echeances.find((e) => e.etat !== 'payee') || null,
  };
}

export const ventesCompletes = (filtre = {}) =>
  Vente.find(filtre).populate('lots').populate('client').sort({ date_signature: -1 });

/** Lots avec statut dérivé : disponible, bloqué, réservé ou vendu. */
export async function listerLots() {
  const [lots, ventes] = await Promise.all([
    Lot.find().lean(),
    Vente.find({}, { lots: 1, statut: 1, client: 1 }).populate('client', 'nom').lean(),
  ]);
  const parLot = new Map();
  for (const v of ventes) for (const id of v.lots) parLot.set(String(id), v);
  return lots
    .map((l) => {
      const v = parLot.get(String(l._id));
      return {
        ...lotJSON(l),
        vente_id: v ? String(v._id) : null,
        client_id: v?.client ? String(v.client._id) : null,
        client_nom: v?.client?.nom ?? null,
        statut: v ? (v.statut === 'vente' ? 'vendu' : 'reserve') : l.bloque ? 'bloque' : 'disponible',
      };
    })
    .sort((a, b) => a.type.localeCompare(b.type) || (a.bloc || '').localeCompare(b.bloc || '') || a.ref.localeCompare(b.ref, 'fr', { numeric: true }));
}

/** Échéances impayées en retard ou proches, avec client et lots. */
export async function listerAlertes() {
  const ventes = await Vente.find({ 'echeances.0': { $exists: true } }).populate('lots', 'ref').populate('client', 'nom tel email');
  const out = [];
  for (const v of ventes) {
    for (const e of v.echeances) {
      const ej = echeanceJSON(e);
      if (ej.etat !== 'retard' && ej.etat !== 'proche') continue;
      out.push({
        ...ej,
        vente_id: String(v._id),
        client_id: String(v.client._id),
        client_nom: v.client.nom,
        client_tel: v.client.tel,
        client_email: v.client.email,
        lots: v.lots.map((l) => l.ref).sort(),
      });
    }
  }
  return out.sort((a, b) => (a.etat === b.etat ? (a.etat === 'retard' ? b.jours - a.jours : a.jours - b.jours) : a.etat === 'retard' ? -1 : 1));
}

/**
 * Échéances impayées de ce mois-ci, pas encore passées et sans rappel envoyé, à partir du
 * JOUR_RAPPEL du mois (le 1er par défaut). Si le serveur était éteint ce jour-là,
 * le rappel part au démarrage suivant.
 */
export async function listerRappels(today = todayISO()) {
  if (Number(today.slice(8, 10)) < JOUR_RAPPEL) return [];
  const mois = today.slice(0, 7);
  const ventes = await Vente.find({ 'echeances.0': { $exists: true } }).populate('lots', 'ref').populate('client', 'nom email');
  const out = [];
  for (const v of ventes) {
    for (const e of v.echeances) {
      if (!e.date_echeance.startsWith(mois) || e.date_echeance < today || e.rappel_le) continue;
      const ej = echeanceJSON(e);
      if (ej.etat === 'payee') continue;
      out.push({ ...ej, vente_id: String(v._id), client_id: String(v.client._id), client_nom: v.client.nom, client_email: v.client.email, lots: v.lots.map((l) => l.ref).sort() });
    }
  }
  return out.sort((a, b) => a.date_echeance.localeCompare(b.date_echeance));
}

const SIGNATURE = 'Cordialement,\nLe service commercial\nFolla Immobilière';
const fmtDT = (n) => Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const dateFR = (iso) => iso.split('-').reverse().join('/');

/** Message de relance pour une ou plusieurs échéances en retard d'un même client. */
export function messageRelance(alertes) {
  const liste = Array.isArray(alertes) ? alertes : [alertes];
  const lots = [...new Set(liste.flatMap((a) => a.lots))];
  const pourLots = `pour ${lots.length > 1 ? 'les lots' : 'le lot'} ${lots.join(', ')}`;
  const retard = (a) => `${a.jours} jour${a.jours > 1 ? 's' : ''} de retard`;
  const corps = liste.length === 1
    ? `Sauf erreur de notre part, l'échéance « ${liste[0].libelle} » de ${fmtDT(liste[0].reste)} DT prévue le ${dateFR(liste[0].date_echeance)} ${pourLots} reste impayée à ce jour (${retard(liste[0])}).`
    : `Sauf erreur de notre part, les échéances suivantes ${pourLots} restent impayées à ce jour :\n${liste.map((a) => `- ${a.libelle} prévue le ${dateFR(a.date_echeance)} : ${fmtDT(a.reste)} DT (${retard(a)})`).join('\n')}\nTotal dû : ${fmtDT(liste.reduce((s, a) => s + a.reste, 0))} DT.`;
  return `Bonjour ${liste[0].client_nom},\n\n${corps}\n\nMerci de bien vouloir régulariser votre situation ou de nous contacter.\n\n${SIGNATURE}`;
}

/** Rappel envoyé en début de mois pour les échéances à venir d'un même client. */
export function messageRappel(echeances) {
  const liste = Array.isArray(echeances) ? echeances : [echeances];
  const lots = [...new Set(liste.flatMap((a) => a.lots))];
  const pourLots = `pour ${lots.length > 1 ? 'les lots' : 'le lot'} ${lots.join(', ')}`;
  const dans = (a) => (a.jours === 0 ? "aujourd'hui" : `dans ${a.jours} jour${a.jours > 1 ? 's' : ''}`);
  const corps = liste.length === 1
    ? `Nous vous rappelons que l'échéance « ${liste[0].libelle} » de ${fmtDT(liste[0].reste)} DT ${pourLots} est à régler le ${dateFR(liste[0].date_echeance)}, soit ${dans(liste[0])}.`
    : `Nous vous rappelons que les échéances suivantes ${pourLots} sont à régler ce mois-ci :\n${liste.map((a) => `- ${a.libelle} le ${dateFR(a.date_echeance)} (${dans(a)}) : ${fmtDT(a.reste)} DT`).join('\n')}\nTotal : ${fmtDT(liste.reduce((s, a) => s + a.reste, 0))} DT.`;
  return `Bonjour ${liste[0].client_nom},\n\n${corps}\n\nSi vous avez déjà effectué ${liste.length > 1 ? 'ces paiements' : 'ce paiement'}, merci de ne pas tenir compte de ce message.\n\n${SIGNATURE}`;
}
