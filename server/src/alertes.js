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

export async function envoyerRelance(alerte, { force = false } = {}) {
  if (!force && relanceRecente(alerte)) return { envoye: false, raison: 'déjà relancé récemment' };
  const t = await getTransporter();
  const texte = messageRelance(alerte);
  const destinataires = [alerte.client_email, process.env.ALERT_EMAIL].filter(Boolean);
  if (t && destinataires.length) {
    await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: alerte.client_email || process.env.ALERT_EMAIL,
      cc: alerte.client_email && process.env.ALERT_EMAIL ? process.env.ALERT_EMAIL : undefined,
      subject: `Échéance impayée – ${alerte.lots.join(', ')}`,
      text: texte,
    });
    await noterRelance(alerte, 'email', destinataires.join(', '));
    return { envoye: true, canal: 'email' };
  }
  await noterRelance(alerte, 'journal');
  console.log(`[alerte] ${alerte.client_nom} – ${alerte.libelle} – ${alerte.reste} DT – ${alerte.jours} j de retard`);
  return { envoye: false, canal: 'journal', raison: 'SMTP non configuré' };
}

export async function verifierEcheances() {
  const enRetard = (await listerAlertes()).filter((a) => a.etat === 'retard');
  for (const a of enRetard) {
    try { await envoyerRelance(a); } catch (e) { console.error('[alerte] échec envoi', a.id, e.message); }
  }
  return enRetard.length;
}

export function demarrerVerificationPeriodique() {
  const heures = Number(process.env.VERIF_INTERVALLE_HEURES || 6);
  const lancer = () => verifierEcheances().catch((e) => console.error('[alerte] vérification impossible', e.message));
  lancer();
  setInterval(lancer, heures * 3600 * 1000).unref();
}
