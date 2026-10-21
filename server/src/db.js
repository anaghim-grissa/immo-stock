// Connexion MongoDB et modèles (Mongoose).
// Les dates d'échéance et de paiement sont stockées au format texte AAAA-MM-JJ :
// ce sont des jours calendaires, sans heure ni fuseau horaire.
import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;
const JOUR = { type: String, match: /^\d{4}-\d{2}-\d{2}$/ };

export const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/immo-stock';

export async function connect() {
  await mongoose.connect(MONGODB_URI);
  for (const m of Object.values(mongoose.models)) {
    // Certains services compatibles MongoDB n'acceptent pas tous les types d'index : on prévient sans bloquer.
    await m.syncIndexes().catch((e) => console.warn(`[mongodb] index de ${m.modelName} non créé : ${e.message}`));
  }
}

export const disconnect = () => mongoose.disconnect();

export const Lot = model('Lot', new Schema({
  ref: { type: String, required: true, unique: true, trim: true },
  type: { type: String, required: true, enum: ['appartement', 'cellier', 'parking'] },
  bloc: String,
  niveau: String,
  typologie: String,
  surface: Number,
  prix: { type: Number, required: true, default: 0 },
  bloque: { type: Boolean, default: false },
  notes: String,
}));

export const Client = model('Client', new Schema({
  nom: { type: String, required: true, trim: true },
  cin: String,
  tel: String,
  email: String,
  adresse: String,
}, { timestamps: true }));

const paiementSchema = new Schema({
  montant: { type: Number, required: true },
  date_paiement: { ...JOUR, required: true },
  mode: String,
  reference: String,
}, { timestamps: { createdAt: true, updatedAt: false } });

const relanceSchema = new Schema({
  canal: { type: String, required: true },
  destinataire: String,
  envoye_le: { type: Date, default: Date.now },
});

const echeanceSchema = new Schema({
  rang: { type: Number, required: true },
  libelle: { type: String, required: true },
  date_echeance: { ...JOUR, required: true },
  montant: { type: Number, required: true },
  paiements: [paiementSchema],
  relances: [relanceSchema],
});

// Un dossier (réservation ou vente) regroupe ses lots et son échéancier.
// L'index unique sur `lots` empêche qu'un même lot figure dans deux dossiers.
export const Vente = model('Vente', new Schema({
  client: { type: ObjectId, ref: 'Client', required: true, index: true },
  statut: { type: String, enum: ['reservation', 'vente'], default: 'reservation' },
  prix_total: { type: Number, required: true },
  date_signature: { ...JOUR, required: true },
  // Jour où le dossier est passé en vente ferme (vide tant que c'est une réservation).
  date_vente: { ...JOUR, default: null },
  notes: String,
  lots: { type: [{ type: ObjectId, ref: 'Lot' }], index: { unique: true } },
  echeances: [echeanceSchema],
}, { timestamps: true }));

// Objectif de ventes d'appartements pour un mois (AAAA-MM).
export const Objectif = model('Objectif', new Schema({
  mois: { type: String, required: true, unique: true, match: /^\d{4}-\d{2}$/ },
  appartements: { type: Number, required: true, min: 0 },
}, { timestamps: true }));

export const User = model('User', new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  nom: String,
  password_hash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'client'], required: true },
  client: { type: ObjectId, ref: 'Client' },
}));

// Les sessions expirent d'elles-mêmes après 30 jours (index TTL).
export const Session = model('Session', new Schema({
  token: { type: String, required: true, unique: true },
  user: { type: ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30 },
}));
