import { Router } from 'express';
import { db, tx } from './db.js';
import { authenticate, requireRole, login, hashPassword } from './auth.js';
import { listerLots, listerAlertes, venteComplete, genererEcheancier, messageRelance, todayISO } from './domain.js';
import { envoyerRelance } from './alertes.js';

export const api = Router();

const wrap = (fn) => (req, res) => {
  try {
    const r = fn(req, res);
    if (r instanceof Promise) r.catch((e) => fail(res, e));
  } catch (e) { fail(res, e); }
};
function fail(res, e) {
  const msg = String(e.message || e);
  if (msg.includes('UNIQUE') && msg.includes('lots.ref')) return res.status(409).json({ error: 'Cette référence de lot existe déjà.' });
  if (msg.includes('UNIQUE') && msg.includes('vente_lots')) return res.status(409).json({ error: 'Un des lots est déjà réservé ou vendu.' });
  if (msg.includes('UNIQUE') && msg.includes('users.email')) return res.status(409).json({ error: 'Cet email a déjà un accès.' });
  if (msg.includes('FOREIGN KEY')) return res.status(409).json({ error: 'Élément utilisé ailleurs, suppression impossible.' });
  if (e.status) return res.status(e.status).json({ error: msg });
  console.error(e);
  res.status(500).json({ error: 'Erreur serveur.' });
}
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const notFound = () => Object.assign(new Error('Introuvable.'), { status: 404 });

/* ---------- Authentification ---------- */
api.post('/auth/login', wrap((req, res) => {
  const r = login(req.body.email, req.body.password);
  if (!r) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  res.json(r);
}));
api.use(authenticate);
api.get('/auth/me', (req, res) => res.json({ user: req.user }));
api.post('/auth/logout', (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.json({ ok: true });
});

/* ---------- Espace client ---------- */
api.get('/portail', requireRole('client'), wrap((req, res) => {
  const client = db.prepare('SELECT id, nom, tel, email FROM clients WHERE id = ?').get(req.user.client_id);
  const ventes = db.prepare('SELECT * FROM ventes WHERE client_id = ? ORDER BY date_signature').all(req.user.client_id).map(venteComplete);
  res.json({ client, ventes });
}));

/* ---------- Société (admin) ---------- */
const admin = Router();
admin.use(requireRole('admin'));
api.use(admin);

admin.get('/stats', wrap((req, res) => {
  const lots = listerLots();
  const parType = {};
  for (const l of lots) {
    parType[l.type] ??= { total: 0, disponible: 0, reserve: 0, vendu: 0, bloque: 0 };
    parType[l.type].total++;
    parType[l.type][l.statut]++;
  }
  const alertes = listerAlertes();
  const retard = alertes.filter((a) => a.etat === 'retard');
  const encaisse = db.prepare('SELECT COALESCE(SUM(montant),0) AS s FROM paiements').get().s;
  const ventesTotal = db.prepare('SELECT COALESCE(SUM(prix_total),0) AS s FROM ventes').get().s;
  res.json({
    parType,
    nb_retard: retard.length,
    montant_retard: retard.reduce((s, a) => s + a.reste, 0),
    nb_proche: alertes.length - retard.length,
    encaisse,
    reste_a_encaisser: ventesTotal - encaisse,
  });
}));

admin.get('/alertes', wrap((req, res) => res.json(listerAlertes().map((a) => ({ ...a, message: messageRelance(a) })))));
admin.post('/alertes/:id/relancer', wrap(async (req, res) => {
  const a = listerAlertes().find((x) => x.id === Number(req.params.id));
  if (!a) throw notFound();
  res.json(await envoyerRelance(a, { force: true }));
}));

/* Lots */
const LOT_FIELDS = ['ref', 'type', 'bloc', 'niveau', 'typologie', 'surface', 'prix', 'bloque', 'notes'];
const lotValues = (b) => LOT_FIELDS.map((f) => (f === 'bloque' ? (b.bloque ? 1 : 0) : b[f] ?? null));
admin.get('/lots', wrap((req, res) => res.json(listerLots())));
admin.post('/lots', wrap((req, res) => {
  if (!req.body.ref || !req.body.type) throw bad('Référence et type obligatoires.');
  const r = db.prepare(`INSERT INTO lots (${LOT_FIELDS}) VALUES (${LOT_FIELDS.map(() => '?')})`).run(...lotValues(req.body));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));
admin.put('/lots/:id', wrap((req, res) => {
  const r = db.prepare(`UPDATE lots SET ${LOT_FIELDS.map((f) => `${f} = ?`)} WHERE id = ?`).run(...lotValues(req.body), req.params.id);
  if (!r.changes) throw notFound();
  res.json({ ok: true });
}));
admin.delete('/lots/:id', wrap((req, res) => {
  db.prepare('DELETE FROM lots WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

/* Clients */
const CLIENT_FIELDS = ['nom', 'cin', 'tel', 'email', 'adresse'];
admin.get('/clients', wrap((req, res) => {
  const clients = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM ventes v WHERE v.client_id = c.id) AS nb_ventes,
           (SELECT email FROM users u WHERE u.client_id = c.id) AS acces_email
    FROM clients c ORDER BY c.nom`).all();
  const retards = {};
  for (const a of listerAlertes()) if (a.etat === 'retard') retards[a.client_id] = (retards[a.client_id] || 0) + a.reste;
  res.json(clients.map((c) => ({ ...c, montant_retard: retards[c.id] || 0 })));
}));
admin.post('/clients', wrap((req, res) => {
  if (!req.body.nom) throw bad('Le nom est obligatoire.');
  const r = db.prepare(`INSERT INTO clients (${CLIENT_FIELDS}) VALUES (${CLIENT_FIELDS.map(() => '?')})`).run(...CLIENT_FIELDS.map((f) => req.body[f] ?? null));
  res.status(201).json({ id: Number(r.lastInsertRowid) });
}));
admin.put('/clients/:id', wrap((req, res) => {
  db.prepare(`UPDATE clients SET ${CLIENT_FIELDS.map((f) => `${f} = ?`)} WHERE id = ?`).run(...CLIENT_FIELDS.map((f) => req.body[f] ?? null), req.params.id);
  res.json({ ok: true });
}));
admin.delete('/clients/:id', wrap((req, res) => {
  db.prepare('DELETE FROM clients WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));
admin.post('/clients/:id/acces', wrap((req, res) => {
  const c = db.prepare('SELECT * FROM clients WHERE id = ?').get(req.params.id);
  if (!c) throw notFound();
  const email = req.body.email || c.email;
  if (!email || !req.body.password || req.body.password.length < 6) throw bad('Email et mot de passe (6 caractères min.) obligatoires.');
  tx(() => {
    db.prepare('DELETE FROM users WHERE client_id = ?').run(c.id);
    db.prepare(`INSERT INTO users (email, nom, password_hash, role, client_id) VALUES (?, ?, ?, 'client', ?)`).run(email, c.nom, hashPassword(req.body.password), c.id);
  });
  res.json({ ok: true, email });
}));

/* Ventes & échéances */
admin.get('/ventes', wrap((req, res) => {
  const ventes = db.prepare('SELECT v.*, c.nom AS client_nom FROM ventes v JOIN clients c ON c.id = v.client_id ORDER BY v.date_signature DESC').all();
  res.json(ventes.map(venteComplete));
}));
admin.get('/ventes/:id', wrap((req, res) => {
  const v = db.prepare('SELECT v.*, c.nom AS client_nom, c.tel AS client_tel, c.email AS client_email FROM ventes v JOIN clients c ON c.id = v.client_id WHERE v.id = ?').get(req.params.id);
  if (!v) throw notFound();
  const out = venteComplete(v);
  out.paiements = db.prepare('SELECT p.*, e.libelle FROM paiements p JOIN echeances e ON e.id = p.echeance_id WHERE e.vente_id = ? ORDER BY p.date_paiement').all(v.id);
  res.json(out);
}));
admin.post('/ventes/apercu', wrap((req, res) => res.json(genererEcheancier(parseVente(req.body)))));
admin.post('/ventes', wrap((req, res) => {
  const p = parseVente(req.body);
  if (!p.clientId) throw bad('Choisissez un client.');
  if (!p.lotIds.length) throw bad('Choisissez au moins un lot.');
  const lignes = Array.isArray(req.body.echeances) && req.body.echeances.length ? req.body.echeances : genererEcheancier(p);
  const somme = lignes.reduce((s, l) => s + Number(l.montant), 0);
  if (Math.abs(somme - p.prixTotal) > 0.01) throw bad(`Le total des échéances (${somme.toFixed(3)}) ne correspond pas au prix (${p.prixTotal.toFixed(3)}).`);
  const id = tx(() => {
    for (const lotId of p.lotIds) {
      const l = db.prepare('SELECT bloque FROM lots WHERE id = ?').get(lotId);
      if (!l) throw bad('Lot introuvable.');
      if (l.bloque) throw bad('Un des lots est bloqué.');
    }
    const r = db.prepare('INSERT INTO ventes (client_id, statut, prix_total, date_signature, notes) VALUES (?, ?, ?, ?, ?)')
      .run(p.clientId, p.statut, p.prixTotal, p.dateSignature, req.body.notes ?? null);
    const vid = Number(r.lastInsertRowid);
    for (const lotId of p.lotIds) db.prepare('INSERT INTO vente_lots (vente_id, lot_id) VALUES (?, ?)').run(vid, lotId);
    lignes.forEach((l, i) => db.prepare('INSERT INTO echeances (vente_id, rang, libelle, date_echeance, montant) VALUES (?, ?, ?, ?, ?)')
      .run(vid, i + 1, l.libelle, l.date_echeance, Number(l.montant)));
    return vid;
  });
  res.status(201).json({ id });
}));
admin.put('/ventes/:id', wrap((req, res) => {
  if (!['reservation', 'vente'].includes(req.body.statut)) throw bad('Statut invalide.');
  db.prepare('UPDATE ventes SET statut = ?, notes = COALESCE(?, notes) WHERE id = ?').run(req.body.statut, req.body.notes ?? null, req.params.id);
  res.json({ ok: true });
}));
admin.delete('/ventes/:id', wrap((req, res) => {
  db.prepare('DELETE FROM ventes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

admin.post('/echeances/:id/paiements', wrap((req, res) => {
  const montant = Number(req.body.montant);
  if (!(montant > 0)) throw bad('Montant invalide.');
  const e = db.prepare('SELECT id FROM echeances WHERE id = ?').get(req.params.id);
  if (!e) throw notFound();
  db.prepare('INSERT INTO paiements (echeance_id, montant, date_paiement, mode, reference) VALUES (?, ?, ?, ?, ?)')
    .run(e.id, montant, req.body.date_paiement || todayISO(), req.body.mode || null, req.body.reference || null);
  res.status(201).json({ ok: true });
}));
admin.delete('/paiements/:id', wrap((req, res) => {
  db.prepare('DELETE FROM paiements WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
}));

function parseVente(b) {
  return {
    clientId: Number(b.clientId) || null,
    lotIds: (b.lotIds || []).map(Number).filter(Boolean),
    statut: b.statut === 'vente' ? 'vente' : 'reservation',
    prixTotal: Number(b.prixTotal) || 0,
    acomptePct: Number(b.acomptePct) || 0,
    nbEcheances: Number(b.nbEcheances) || 1,
    periodicite: b.periodicite || 'mensuelle',
    dateSignature: b.dateSignature || todayISO(),
    datePremiere: b.datePremiere || null,
  };
}
