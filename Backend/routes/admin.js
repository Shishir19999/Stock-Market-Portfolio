import { Router } from 'express';
import { ValidationError, normalizeSettings } from '../../shared/validate.js';
import { COLLECTIONS } from '../../shared/service.js';
import { publicUser, requireAdmin, requireAuth } from '../lib/auth.js';
import { audit, getSettings, getStocks, saveSettings } from '../lib/context.js';
import { Audit, OWNED, User } from '../lib/models.js';

export function adminRouter({ market }) {
  const r = Router();
  r.use(requireAuth, requireAdmin);

  r.get('/users', async (req, res) => {
    const users = await User.find().sort({ createdAt: 1 }).lean();
    const counts = await OWNED.transactions.aggregate([{ $group: { _id: '$userId', n: { $sum: 1 } } }]);
    const byUser = Object.fromEntries(counts.map((c) => [c._id, c.n]));
    res.json(users.map((u) => ({ ...publicUser(u), transactions: byUser[String(u._id)] || 0 })));
  });

  r.patch('/users/:id', async (req, res) => {
    const target = await User.findById(req.params.id).catch(() => null);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    const { role, active } = req.body || {};
    const self = String(target._id) === String(req.user._id);
    const changes = [];
    if (role !== undefined) {
      if (!['user', 'admin'].includes(role)) throw new ValidationError('Role must be user or admin.', 'role');
      if (self && role !== 'admin') throw new ValidationError('You cannot remove your own admin role.');
      if (role !== target.role) changes.push(`role ${target.role} -> ${role}`);
      target.role = role;
    }
    if (active !== undefined) {
      if (self && !active) throw new ValidationError('You cannot deactivate your own account.');
      if (Boolean(active) !== target.active) changes.push(active ? 'activated' : 'deactivated');
      target.active = Boolean(active);
    }
    await target.save();
    if (changes.length) await audit(req.user, 'user.update', target.email, changes.join(', '));
    res.json(publicUser(target));
  });

  r.delete('/users/:id', async (req, res) => {
    const target = await User.findById(req.params.id).catch(() => null);
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (String(target._id) === String(req.user._id)) throw new ValidationError('You cannot delete your own account.');
    for (const c of COLLECTIONS) await OWNED[c].deleteMany({ userId: String(target._id) });
    await target.deleteOne();
    await audit(req.user, 'user.delete', target.email);
    res.json({ ok: true });
  });

  r.get('/settings', async (req, res) => res.json({ settings: await getSettings(), market: market.status() }));
  r.put('/settings', async (req, res) => {
    const current = await getSettings();
    const next = normalizeSettings(req.body || {}, current);
    await saveSettings(next);
    const diff = Object.keys(next).filter((k) => next[k] !== current[k]).map((k) => `${k}=${next[k]}`).join(', ');
    await audit(req.user, 'settings.update', '', diff || 'no change');
    res.json({ settings: next, market: market.status() });
  });

  r.get('/audit', async (req, res) => {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const rows = await Audit.find().sort({ at: -1 }).limit(limit).lean();
    res.json(rows.map((a) => ({ id: String(a._id), at: a.at, actorName: a.actorName, action: a.action, target: a.target, detail: a.detail })));
  });

  r.get('/stats', async (req, res) => {
    const [users, admins, stocks] = await Promise.all([User.countDocuments(), User.countDocuments({ role: 'admin' }), getStocks()]);
    const [portfolios, transactions, openOrders] = await Promise.all([
      OWNED.portfolios.countDocuments(), OWNED.transactions.countDocuments(), OWNED.orders.countDocuments({ status: 'open' }),
    ]);
    res.json({ users, admins, stocks: stocks.length, portfolios, transactions, openOrders, market: market.status() });
  });

  return r;
}
