import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { User, Session } from './db.js';

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

export async function login(email, password) {
  const u = await User.findOne({ email: String(email || '').toLowerCase().trim() });
  if (!u || !verifyPassword(password || '', u.password_hash)) return null;
  const token = randomBytes(32).toString('hex');
  await Session.create({ token, user: u._id });
  return { token, user: publicUser(u) };
}

export function publicUser(u) {
  return { id: String(u._id), email: u.email, nom: u.nom, role: u.role, client_id: u.client ? String(u.client) : null };
}

export async function authenticate(req, res, next) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    const s = token && (await Session.findOne({ token }).populate('user'));
    if (!s?.user) return res.status(401).json({ error: 'Session expirée, reconnectez-vous.' });
    req.user = publicUser(s.user);
    req.token = token;
    next();
  } catch (e) {
    next(e);
  }
}

export const requireRole = (role) => (req, res, next) =>
  req.user.role === role ? next() : res.status(403).json({ error: 'Accès refusé.' });
