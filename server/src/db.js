import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DB_PATH = process.env.DB_PATH || fileURLToPath(new URL('../data/immo.db', import.meta.url));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS lots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ref TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('appartement','cellier','parking')),
  bloc TEXT,
  niveau TEXT,
  typologie TEXT,
  surface REAL,
  prix REAL NOT NULL DEFAULT 0,
  bloque INTEGER NOT NULL DEFAULT 0,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nom TEXT NOT NULL,
  cin TEXT,
  tel TEXT,
  email TEXT,
  adresse TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ventes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  statut TEXT NOT NULL DEFAULT 'reservation' CHECK (statut IN ('reservation','vente')),
  prix_total REAL NOT NULL,
  date_signature TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vente_lots (
  vente_id INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  lot_id INTEGER NOT NULL UNIQUE REFERENCES lots(id) ON DELETE RESTRICT,
  PRIMARY KEY (vente_id, lot_id)
);

CREATE TABLE IF NOT EXISTS echeances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vente_id INTEGER NOT NULL REFERENCES ventes(id) ON DELETE CASCADE,
  rang INTEGER NOT NULL,
  libelle TEXT NOT NULL,
  date_echeance TEXT NOT NULL,
  montant REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS paiements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  echeance_id INTEGER NOT NULL REFERENCES echeances(id) ON DELETE CASCADE,
  montant REAL NOT NULL,
  date_paiement TEXT NOT NULL,
  mode TEXT,
  reference TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS relances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  echeance_id INTEGER NOT NULL REFERENCES echeances(id) ON DELETE CASCADE,
  canal TEXT NOT NULL,
  destinataire TEXT,
  envoye_le TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  nom TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','client')),
  client_id INTEGER REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
