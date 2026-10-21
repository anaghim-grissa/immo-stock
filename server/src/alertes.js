// Vérification périodique des échéances en retard et envoi des relances par email.
// Sans configuration SMTP, les alertes restent visibles dans le tableau de bord et sont journalisées.
import { Vente } from './db.js';
import { listerAlertes, messageRelance } from './domain.js';

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

/** Vérifie les retards et envoie au plus une relance groupée par client. */
export async function verifierEcheances() {
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
