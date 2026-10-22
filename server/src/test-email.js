// Envoie un email de rappel et un email de relance d'exemple pour vérifier la configuration SMTP de server/.env :
//   npm run test-email -- adresse@exemple.com
import nodemailer from 'nodemailer';
import { messageRelance, messageRappel, todayISO, JOUR_ECHEANCE } from './domain.js';

const to = process.argv[2];
if (!to) {
  console.error('Usage : npm run test-email -- adresse@exemple.com');
  process.exit(1);
}
if (!process.env.SMTP_HOST) {
  console.error('SMTP_HOST est vide : renseignez la messagerie dans server/.env (voir .env.example).');
  process.exit(1);
}

const t = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
});

const exemple = {
  client_nom: 'Client de test', libelle: 'Échéance 3/12', date_echeance: todayISO(new Date(Date.now() - 15 * 86400000)),
  reste: 12500, jours: 15, lots: ['A-101', 'P-07'],
};

const d = new Date();
const prochaine = todayISO(new Date(d.getFullYear(), d.getMonth() + (d.getDate() > JOUR_ECHEANCE ? 1 : 0), JOUR_ECHEANCE));
const rappel = {
  client_nom: 'Client de test', libelle: 'Échéance 4/12', date_echeance: prochaine,
  reste: 12500, jours: Math.round((Date.parse(prochaine) - Date.parse(todayISO())) / 86400000), lots: ['A-101', 'P-07'],
};

try {
  await t.verify();
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const intro = 'Ceci est un email de test envoyé par Folla Immobilière.\n\n';
  await t.sendMail({ from, to, subject: `[Test] Rappel : échéance du ${prochaine.split('-').reverse().join('/')} – A-101, P-07`, text: intro + messageRappel(rappel) });
  await t.sendMail({ from, to, subject: '[Test] Échéance impayée – A-101, P-07', text: intro + messageRelance(exemple) });
  console.log(`2 emails de test envoyés à ${to} : le rappel de début de mois et la relance de retard.`);
} catch (e) {
  console.error(`Échec de l'envoi : ${e.message}`);
  if (/Invalid login|535|auth/i.test(e.message)) console.error("Vérifiez SMTP_USER et SMTP_PASS (avec Gmail : un mot de passe d'application, pas le mot de passe habituel).");
  process.exit(1);
}
