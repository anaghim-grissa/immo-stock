import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

export function hashPassword(pw) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(pw, salt, 64).toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(pw, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function login(email, password) {
  const u = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email || '');
  if (!u || !verifyPassword(password || '', u.password_hash)) return null;
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, u.id);
  return { token, user: publicUser(u) };
}

export function publicUser(u) {
  return { id: u.id, email: u.email, nom: u.nom, role: u.role, client_id: u.client_id };
}

export function authenticate(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  const u = token && db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?').get(token);
  if (!u) return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
  req.user = publicUser(u);
  req.token = token;
  next();
}

export const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Accès refusé.' });
