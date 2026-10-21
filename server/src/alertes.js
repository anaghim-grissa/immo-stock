// Vérification périodique des échéances en retard et envoi des relances par email.
// Sans configuration SMTP, les alertes restent visibles dans le tableau de bord et sont journalisées.
import { db } from './db.js';
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

function relanceRecente(echeanceId) {
  const r = db.prepare(`SELECT 1 FROM relances WHERE echeance_id = ? AND envoye_le >= datetime('now', ?)`)
    .get(echeanceId, `-${INTERVALLE_RELANCE_JOURS} days`);
  return !!r;
}

export async function envoyerRelance(alerte, { force = false } = {}) {
  if (!force && relanceRecente(alerte.id)) return { envoye: false, raison: 'déjà relancé récemment' };
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
    db.prepare('INSERT INTO relances (echeance_id, canal, destinataire) VALUES (?, ?, ?)').run(alerte.id, 'email', destinataires.join(', '));
    return { envoye: true, canal: 'email' };
  }
  db.prepare('INSERT INTO relances (echeance_id, canal, destinataire) VALUES (?, ?, ?)').run(alerte.id, 'journal', null);
  console.log(`[alerte] ${alerte.client_nom} – ${alerte.libelle} – ${alerte.reste} DT – ${alerte.jours} j de retard`);
  return { envoye: false, canal: 'journal', raison: 'SMTP non configuré' };
}

export async function verifierEcheances() {
  const enRetard = listerAlertes().filter((a) => a.etat === 'retard');
  for (const a of enRetard) {
    try { await envoyerRelance(a); } catch (e) { console.error('[alerte] échec envoi', a.id, e.message); }
  }
  return enRetard.length;
}

export function demarrerVerificationPeriodique() {
  const heures = Number(process.env.VERIF_INTERVALLE_HEURES || 6);
  verifierEcheances();
  setInterval(verifierEcheances, heures * 3600 * 1000).unref();
}
