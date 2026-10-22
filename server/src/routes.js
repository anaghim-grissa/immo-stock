import { Router } from 'express';
import mongoose from 'mongoose';
import { Lot, Client, Vente, User, Session, Objectif } from './db.js';
import { authenticate, requireRole, login, hashPassword } from './auth.js';
import { listerLots, listerAlertes, venteJSON, ventesCompletes, genererEcheancier, messageRelance, todayISO, round3, JOUR_ECHEANCE, JOUR_RAPPEL, prochainJourEcheance, echeanceAAligner } from './domain.js';
import { envoyerRelance } from './alertes.js';

export const api = Router();

const wrap = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).catch((e) => fail(res, e));
function fail(res, e) {
  if (e.code === 11000) {
    const champ = Object.keys(e.keyPattern || {})[0];
    const msg = { ref: 'Cette référence de lot existe déjà.', lots: 'Un des lots est déjà réservé ou vendu.', email: 'Cet email a déjà un accès.' }[champ];
    return res.status(409).json({ error: msg || 'Doublon.' });
  }
  if (e instanceof mongoose.Error.CastError) return res.status(404).json({ error: 'Introuvable.' });
  if (e instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: Object.values(e.errors)[0]?.message || 'Données invalides.' });
  if (e.status) return res.status(e.status).json({ error: e.message });
  console.error(e);
  res.status(500).json({ error: 'Erreur serveur.' });
}
const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const conflict = (msg) => Object.assign(new Error(msg), { status: 409 });
const notFound = () => Object.assign(new Error('Introuvable.'), { status: 404 });

/* ---------- Authentification ---------- */
api.post('/auth/login', wrap(async (req, res) => {
  const r = await login(req.body.email, req.body.password);
  if (!r) return res.status(401).json({ error: 'Email ou mot de passe incorrect.' });
  res.json(r);
}));
api.use(authenticate);
api.get('/auth/me', (req, res) => res.json({ user: req.user }));
api.get('/reglages', (req, res) => res.json({ jour_echeance: JOUR_ECHEANCE, jour_rappel: JOUR_RAPPEL }));
api.post('/auth/logout', wrap(async (req, res) => {
  await Session.deleteOne({ token: req.token });
  res.json({ ok: true });
}));

/* ---------- Espace client ---------- */
api.get('/portail', requireRole('client'), wrap(async (req, res) => {
  const c = await Client.findById(req.user.client_id).lean();
  if (!c) throw notFound();
  const ventes = (await ventesCompletes({ client: c._id })).map(venteJSON).reverse();
  res.json({ client: { id: String(c._id), nom: c.nom, tel: c.tel, email: c.email }, ventes });
}));

/* ---------- Société (admin) ---------- */
const admin = Router();
admin.use(requireRole('admin'));
api.use(admin);

admin.get('/stats', wrap(async (req, res) => {
  const [lots, alertes, ventes] = await Promise.all([listerLots(), listerAlertes(), Vente.find({}, { prix_total: 1, 'echeances.paiements.montant': 1 }).lean()]);
  const parType = {};
  for (const l of lots) {
    parType[l.type] ??= { total: 0, disponible: 0, reserve: 0, vendu: 0, bloque: 0 };
    parType[l.type].total++;
    parType[l.type][l.statut]++;
  }
  const retard = alertes.filter((a) => a.etat === 'retard');
  let encaisse = 0, ventesTotal = 0;
  for (const v of ventes) {
    ventesTotal += v.prix_total;
    for (const e of v.echeances) for (const p of e.paiements) encaisse += p.montant;
  }
  res.json({
    parType,
    nb_retard: retard.length,
    montant_retard: round3(retard.reduce((s, a) => s + a.reste, 0)),
    nb_proche: alertes.length - retard.length,
    encaisse: round3(encaisse),
    reste_a_encaisser: round3(ventesTotal - encaisse),
  });
}));

admin.get('/alertes', wrap(async (req, res) => res.json((await listerAlertes()).map((a) => ({ ...a, message: messageRelance(a) })))));
admin.post('/alertes/:id/relancer', wrap(async (req, res) => {
  const a = (await listerAlertes()).find((x) => x.id === req.params.id);
  if (!a) throw notFound();
  res.json(await envoyerRelance(a, { force: true }));
}));

/* Objectifs et ventes du mois */
const decalerMois = (mois, n) => {
  const [y, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
admin.get('/objectifs', wrap(async (req, res) => {
  const mois = /^\d{4}-\d{2}$/.test(req.query.mois || '') ? req.query.mois : todayISO().slice(0, 7);
  const periode = Array.from({ length: 6 }, (_, i) => decalerMois(mois, i - 5));
  const [ventes, objectifs] = await Promise.all([
    Vente.find({ statut: 'vente', date_vente: { $gte: `${periode[0]}-01`, $lte: `${mois}-31` } }).populate('lots').populate('client', 'nom').lean(),
    Objectif.find({ mois: { $lte: mois } }).sort({ mois: -1 }).lean(),
  ]);
  // Sans objectif saisi pour un mois, on reprend le dernier objectif connu avant lui.
  const objectifDe = (m) => objectifs.find((o) => o.mois <= m) ?? null;
  const historique = periode.map((m) => {
    const vs = ventes.filter((v) => v.date_vente.startsWith(m));
    const o = objectifDe(m);
    return {
      mois: m,
      appartements: vs.reduce((n, v) => n + v.lots.filter((l) => l.type === 'appartement').length, 0),
      objectif: o?.appartements ?? null,
      objectif_herite: !!o && o.mois !== m,
    };
  });
  const duMois = ventes.filter((v) => v.date_vente.startsWith(mois));
  const compter = (t) => duMois.reduce((n, v) => n + v.lots.filter((l) => l.type === t).length, 0);
  const debut = `${mois}-01`, fin = `${mois}-31`;
  res.json({
    mois,
    ...historique.at(-1),
    celliers: compter('cellier'),
    parkings: compter('parking'),
    montant: round3(duMois.reduce((s, v) => s + v.prix_total, 0)),
    reservations: await Vente.countDocuments({ statut: 'reservation', date_signature: { $gte: debut, $lte: fin } }),
    historique,
    ventes: duMois
      .sort((a, b) => b.date_vente.localeCompare(a.date_vente))
      .map((v) => ({ id: String(v._id), client_nom: v.client?.nom, date_vente: v.date_vente, prix_total: v.prix_total, lots: v.lots.map((l) => ({ ref: l.ref, type: l.type, typologie: l.typologie ?? null })) })),
  });
}));
admin.put('/objectifs/:mois', wrap(async (req, res) => {
  if (!/^\d{4}-\d{2}$/.test(req.params.mois)) throw bad('Mois invalide.');
  const n = Number(req.body.appartements);
  if (!Number.isInteger(n) || n < 0) throw bad("L'objectif doit être un nombre entier positif.");
  await Objectif.findOneAndUpdate({ mois: req.params.mois }, { appartements: n }, { upsert: true });
  res.json({ ok: true });
}));

/* Lots */
const lotBody = (b) => ({
  ref: b.ref, type: b.type, bloc: b.bloc || null, niveau: b.niveau || null, typologie: b.typologie || null,
  surface: b.surface === '' || b.surface == null ? null : Number(b.surface), prix: Number(b.prix) || 0, bloque: !!b.bloque, notes: b.notes || null,
});
admin.get('/lots', wrap(async (req, res) => res.json(await listerLots())));
admin.post('/lots', wrap(async (req, res) => {
  if (!req.body.ref || !req.body.type) throw bad('Référence et type obligatoires.');
  const l = await Lot.create(lotBody(req.body));
  res.status(201).json({ id: String(l._id) });
}));
admin.put('/lots/:id', wrap(async (req, res) => {
  const l = await Lot.findByIdAndUpdate(req.params.id, lotBody(req.body), { runValidators: true });
  if (!l) throw notFound();
  res.json({ ok: true });
}));
admin.delete('/lots/:id', wrap(async (req, res) => {
  if (await Vente.exists({ lots: req.params.id })) throw conflict('Ce lot fait partie d’un dossier, suppression impossible.');
  await Lot.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

/* Clients */
const CLIENT_FIELDS = ['nom', 'cin', 'tel', 'email', 'adresse'];
const clientBody = (b) => Object.fromEntries(CLIENT_FIELDS.map((f) => [f, b[f] ?? null]));
admin.get('/clients', wrap(async (req, res) => {
  const [clients, ventes, users, alertes] = await Promise.all([
    Client.find().sort({ nom: 1 }).lean(),
    Vente.find({}, { client: 1 }).lean(),
    User.find({ role: 'client' }, { email: 1, client: 1 }).lean(),
    listerAlertes(),
  ]);
  const nb = {}, acces = {}, retards = {};
  for (const v of ventes) nb[v.client] = (nb[v.client] || 0) + 1;
  for (const u of users) acces[u.client] = u.email;
  for (const a of alertes) if (a.etat === 'retard') retards[a.client_id] = (retards[a.client_id] || 0) + a.reste;
  res.json(clients.map((c) => ({
    id: String(c._id), ...clientBody(c), nb_ventes: nb[c._id] || 0, acces_email: acces[c._id] || null, montant_retard: round3(retards[c._id] || 0),
  })));
}));
admin.post('/clients', wrap(async (req, res) => {
  if (!req.body.nom) throw bad('Le nom est obligatoire.');
  const c = await Client.create(clientBody(req.body));
  res.status(201).json({ id: String(c._id) });
}));
admin.put('/clients/:id', wrap(async (req, res) => {
  if (!(await Client.findByIdAndUpdate(req.params.id, clientBody(req.body)))) throw notFound();
  res.json({ ok: true });
}));
admin.delete('/clients/:id', wrap(async (req, res) => {
  if (await Vente.exists({ client: req.params.id })) throw conflict('Ce client a des dossiers, suppression impossible.');
  await User.deleteMany({ client: req.params.id });
  await Client.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));
admin.post('/clients/:id/acces', wrap(async (req, res) => {
  const c = await Client.findById(req.params.id);
  if (!c) throw notFound();
  const email = String(req.body.email || c.email || '').toLowerCase().trim();
  if (!email || !req.body.password || req.body.password.length < 6) throw bad('Email et mot de passe (6 caractères min.) obligatoires.');
  const autre = await User.findOne({ email, client: { $ne: c._id } });
  if (autre) throw conflict('Cet email a déjà un accès.');
  await User.deleteMany({ client: c._id });
  await User.create({ email, nom: c.nom, password_hash: hashPassword(req.body.password), role: 'client', client: c._id });
  res.json({ ok: true, email });
}));

/* Ventes & échéances */
admin.get('/ventes', wrap(async (req, res) => res.json((await ventesCompletes()).map(venteJSON))));
admin.get('/ventes/:id', wrap(async (req, res) => {
  const v = await Vente.findById(req.params.id).populate('lots').populate('client');
  if (!v) throw notFound();
  const out = venteJSON(v);
  out.paiements = v.echeances
    .flatMap((e) => e.paiements.map((p) => ({ id: String(p._id), libelle: e.libelle, montant: p.montant, date_paiement: p.date_paiement, mode: p.mode ?? null, reference: p.reference ?? null })))
    .sort((a, b) => a.date_paiement.localeCompare(b.date_paiement));
  res.json(out);
}));
admin.post('/ventes/apercu', wrap(async (req, res) => res.json(genererEcheancier(parseVente(req.body)))));
admin.post('/ventes', wrap(async (req, res) => {
  const p = parseVente(req.body);
  if (!p.clientId) throw bad('Choisissez un client.');
  if (!p.lotIds.length) throw bad('Choisissez au moins un lot.');
  const lignes = Array.isArray(req.body.echeances) && req.body.echeances.length ? req.body.echeances : genererEcheancier(p);
  const somme = lignes.reduce((s, l) => s + Number(l.montant), 0);
  if (Math.abs(somme - p.prixTotal) > 0.01) throw bad(`Le total des échéances (${somme.toFixed(3)}) ne correspond pas au prix (${p.prixTotal.toFixed(3)}).`);
  if (!(await Client.exists({ _id: p.clientId }))) throw bad('Client introuvable.');
  const lots = await Lot.find({ _id: { $in: p.lotIds } }, { bloque: 1 }).lean();
  if (lots.length !== p.lotIds.length) throw bad('Lot introuvable.');
  if (lots.some((l) => l.bloque)) throw bad('Un des lots est bloqué.');
  if (await Vente.exists({ lots: { $in: p.lotIds } })) throw conflict('Un des lots est déjà réservé ou vendu.');
  const v = await Vente.create({
    client: p.clientId, statut: p.statut, prix_total: p.prixTotal, date_signature: p.dateSignature,
    date_vente: p.statut === 'vente' ? p.dateSignature : null, notes: req.body.notes ?? null, lots: p.lotIds,
    echeances: lignes.map((l, i) => ({ rang: i + 1, libelle: l.libelle, date_echeance: l.date_echeance, montant: Number(l.montant) })),
  });
  res.status(201).json({ id: String(v._id) });
}));
admin.put('/ventes/:id', wrap(async (req, res) => {
  if (!['reservation', 'vente'].includes(req.body.statut)) throw bad('Statut invalide.');
  const v = await Vente.findById(req.params.id);
  if (!v) throw notFound();
  if (req.body.statut !== v.statut) v.date_vente = req.body.statut === 'vente' ? todayISO() : null;
  v.statut = req.body.statut;
  if (req.body.notes != null) v.notes = req.body.notes;
  await v.save();
  res.json({ ok: true });
}));
admin.delete('/ventes/:id', wrap(async (req, res) => {
  await Vente.deleteOne({ _id: req.params.id });
  res.json({ ok: true });
}));

// Anciens dossiers : place les échéances impayées sur le prochain JOUR_ECHEANCE (jamais plus tôt).
admin.get('/echeances/a-aligner', wrap(async (req, res) => {
  const ventes = await Vente.find({ 'echeances.0': { $exists: true } });
  res.json({ nombre: ventes.reduce((n, v) => n + v.echeances.filter((e) => echeanceAAligner(e)).length, 0) });
}));
admin.post('/echeances/aligner', wrap(async (req, res) => {
  let modifiees = 0;
  for (const v of await Vente.find({ 'echeances.0': { $exists: true } })) {
    const aAligner = v.echeances.filter((e) => echeanceAAligner(e));
    if (!aAligner.length) continue;
    for (const e of aAligner) e.date_echeance = prochainJourEcheance(e.date_echeance);
    await v.save();
    modifiees += aAligner.length;
  }
  res.json({ modifiees });
}));
admin.post('/echeances/:id/paiements', wrap(async (req, res) => {
  const montant = Number(req.body.montant);
  if (!(montant > 0)) throw bad('Montant invalide.');
  const v = await Vente.findOne({ 'echeances._id': req.params.id });
  if (!v) throw notFound();
  v.echeances.id(req.params.id).paiements.push({ montant, date_paiement: req.body.date_paiement || todayISO(), mode: req.body.mode || null, reference: req.body.reference || null });
  await v.save();
  res.status(201).json({ ok: true });
}));
admin.delete('/paiements/:id', wrap(async (req, res) => {
  const v = await Vente.findOne({ 'echeances.paiements._id': req.params.id });
  if (!v) throw notFound();
  for (const e of v.echeances) e.paiements.pull(req.params.id);
  await v.save();
  res.json({ ok: true });
}));

function parseVente(b) {
  return {
    clientId: b.clientId || null,
    lotIds: [...new Set((b.lotIds || []).filter(Boolean).map(String))],
    statut: b.statut === 'vente' ? 'vente' : 'reservation',
    prixTotal: Number(b.prixTotal) || 0,
    acomptePct: Number(b.acomptePct) || 0,
    nbEcheances: Number(b.nbEcheances) || 1,
    periodicite: b.periodicite || 'mensuelle',
    dateSignature: b.dateSignature || todayISO(),
    datePremiere: /^\d{4}-\d{2}/.test(b.datePremiere || '') ? b.datePremiere : null,
  };
}
