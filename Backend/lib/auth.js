import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from './models.js';

let secret = null;
export function getSecret() {
  if (secret) return secret;
  if (process.env.JWT_SECRET) {
    secret = process.env.JWT_SECRET;
    return secret;
  }
  if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set in production.');
  // Development fallback: a random per-process secret (sessions end when the server restarts).
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('JWT_SECRET is not set; using a temporary random secret for this process.');
  return secret;
}

export const hashPassword = (pw) => bcrypt.hash(pw, 10);
export const checkPassword = (pw, hash) => bcrypt.compare(pw, hash);
export const signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role }, getSecret(), { expiresIn: '7d' });
export const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, active: u.active, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt });

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Please sign in.' });
  let payload;
  try {
    payload = jwt.verify(token, getSecret());
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please sign in again.' });
  }
  const user = await User.findById(payload.sub);
  if (!user || !user.active) return res.status(401).json({ error: 'This account is not available.' });
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: 'Administrator access is required.' });
  next();
}

/** Tiny in-memory limiter for sign-in attempts: `max` failures per `windowMs` per key. */
export function createLimiter({ max = 10, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map();
  const fresh = (key) => (hits.get(key) || []).filter((t) => now() - t < windowMs);
  return {
    blocked: (key) => fresh(key).length >= max,
    fail(key) {
      hits.set(key, [...fresh(key), now()]);
    },
    clear: (key) => hits.delete(key),
  };
}
