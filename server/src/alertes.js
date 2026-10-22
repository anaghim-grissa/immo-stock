// Vérification périodique des échéances : rappel en début de mois pour les échéances à venir,
// relance par email pour les échéances en retard.
// Sans configuration SMTP, les alertes restent visibles dans le tableau de bord et sont journalisées.
import { Vente } from './db.js';
import { listerAlertes, listerRappels, messageRelance, messageRappel } from './domain.js';

const INTERVALLE_RELANCE_JOURS = Number(process.env.INTERVALLE_RELANCE_JOURS || 7);

let transporter = null;
async function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const nodemailer = (await import('nodemailer')).default;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

const relanceRecente = (alerte) =>
  !!alerte.derniere_relance && Date.now() - Date.parse(alerte.derniere_relance) < INTERVALLE_RELANCE_JOURS * 86400000;

async function noterRelance(alerte, canal, destinataire = null) {
  const v = await Vente.findById(alerte.vente_id);
  v?.echeances.id(alerte.id)?.relances.push({ canal, destinataire });
  await v?.save();
}

/**
 * Relance un client par email pour une ou plusieurs de ses échéances en retard.
 */
export async function envoyerRelance(alertes, { force = false } = {}) {
  const liste = (Array.isArray(alertes) ? alertes : [alertes]).filter((a) => force || !relanceRecente(a));
  if (!liste.length) return { envoye: false, canaux: [], raison: 'déjà relancé récemment' };
  const a = liste[0];
  const canaux = [], erreurs = [];

  const t = await getTransporter();
  const destinataires = [a.client_email, process.env.ALERT_EMAIL].filter(Boolean);
  if (t && destinataires.length) {
    try {
      await t.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: a.client_email || process.env.ALERT_EMAIL,
        cc: a.client_email && process.env.ALERT_EMAIL ? process.env.ALERT_EMAIL : undefined,
        subject: `Échéance impayée – ${[...new Set(liste.flatMap((x) => x.lots))].join(', ')}`,
        text: messageRelance(liste),
      });
      for (const x of liste) await noterRelance(x, 'email', destinataires.join(', '));
      canaux.push('email');
    } catch (e) { erreurs.push(`email : ${e.message}`); }
  }

  // Un envoi en échec n'est pas noté : il sera retenté à la prochaine vérification.
  if (!canaux.length && !erreurs.length) for (const x of liste) await noterRelance(x, 'journal');
  if (!canaux.length) console.log(`[alerte] ${a.client_nom} – ${liste.length} échéance(s) en retard${erreurs.length ? ` – ${erreurs.join(' ; ')}` : ''}`);
  return { envoye: canaux.length > 0, canaux, erreurs };
}

/** Envoie à un client le rappel de ses échéances du mois ; chaque échéance n'est rappelée qu'une fois. */
export async function envoyerRappel(echeances) {
  const a = echeances[0];
  const t = await getTransporter();
  // Sans messagerie ou sans adresse, rien n'est noté : le rappel partira quand ce sera possible.
  if (!t || !a.client_email) return false;
  const dates = [...new Set(echeances.map((x) => x.date_echeance.split('-').reverse().join('/')))].join(', ');
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: a.client_email,
    cc: process.env.ALERT_EMAIL || undefined,
    subject: `Rappel : échéance du ${dates}${a.jours > 0 ? ` (dans ${a.jours} jour${a.jours > 1 ? 's' : ''})` : ''} – ${[...new Set(echeances.flatMap((x) => x.lots))].join(', ')}`,
    text: messageRappel(echeances),
  });
  for (const x of echeances) {
    const v = await Vente.findById(x.vente_id);
    const e = v?.echeances.id(x.id);
    if (e) { e.rappel_le = new Date(); await v.save(); }
  }
  return true;
}

/** Rappels du mois (un email par client), puis relances des retards (au plus une relance groupée par client). */
export async function verifierEcheances() {
  const parClientRappel = Map.groupBy(await listerRappels(), (a) => a.client_id);
  for (const echeances of parClientRappel.values()) {
    try { await envoyerRappel(echeances); } catch (e) { console.error('[rappel] échec', echeances[0].client_nom, e.message); }
  }
  const enRetard = (await listerAlertes()).filter((a) => a.etat === 'retard' && !relanceRecente(a));
  const parClient = Map.groupBy(enRetard, (a) => a.client_id);
  for (const alertes of parClient.values()) {
    try { await envoyerRelance(alertes); } catch (e) { console.error('[alerte] échec relance', alertes[0].client_nom, e.message); }
  }
  return enRetard.length;
}

export function demarrerVerificationPeriodique() {
  const heures = Number(process.env.VERIF_INTERVALLE_HEURES || 6);
  const lancer = () => verifierEcheances().catch((e) => console.error('[alerte] vérification impossible', e.message));
  lancer();
  setInterval(lancer, heures * 3600 * 1000).unref();
}
