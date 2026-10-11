import { Router } from 'express';
import { ValidationError, normalizeCredentials } from '../../shared/validate.js';
import { initUser } from '../../shared/service.js';
import { checkPassword, createLimiter, hashPassword, publicUser, requireAuth, signToken } from '../lib/auth.js';
import { audit, buildContext } from '../lib/context.js';
import { createMongoStore } from '../lib/mongoStore.js';
import { User } from '../lib/models.js';

export function authRouter({ market }) {
  const r = Router();
  const store = createMongoStore();
  const limiter = createLimiter();

  r.post('/signup', async (req, res) => {
    const body = normalizeCredentials(req.body || {}, { signup: true });
    const ctx = await buildContext(market);
    const isFirst = (await User.estimatedDocumentCount()) === 0;
    if (!isFirst && !ctx.settings.allowSignups) return res.status(403).json({ error: 'New sign-ups are turned off.' });
    if (await User.exists({ email: body.email })) return res.status(409).json({ error: 'An account with this email already exists.' });
    let user;
    try {
      user = await User.create({ name: body.name, email: body.email, passwordHash: await hashPassword(body.password), role: isFirst ? 'admin' : 'user', lastLoginAt: new Date() });
    } catch (e) {
      if (e.code === 11000) return res.status(409).json({ error: 'An account with this email already exists.' });
      throw e;
    }
    await initUser(store, String(user._id), ctx);
    await audit(user, 'signup', user.email, isFirst ? 'first account, promoted to admin' : '');
    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  });

  r.post('/login', async (req, res) => {
    const body = normalizeCredentials(req.body || {});
    const key = `${req.ip}|${body.email}`;
    if (limiter.blocked(key)) return res.status(429).json({ error: 'Too many failed attempts. Try again in a few minutes.' });
    const user = await User.findOne({ email: body.email });
    const ok = user ? await checkPassword(body.password, user.passwordHash) : false;
    if (!ok) {
      limiter.fail(key);
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
    if (!user.active) return res.status(403).json({ error: 'This account has been deactivated.' });
    limiter.clear(key);
    user.lastLoginAt = new Date();
    await user.save();
    await audit(user, 'login', user.email);
    res.json({ token: signToken(user), user: publicUser(user) });
  });

  r.get('/me', requireAuth, (req, res) => res.json({ user: publicUser(req.user) }));

  r.post('/logout', requireAuth, async (req, res) => {
    await audit(req.user, 'logout', req.user.email);
    res.json({ ok: true });
  });

  return r;
}

export { ValidationError };
