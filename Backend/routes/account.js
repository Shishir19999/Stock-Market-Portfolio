// Authenticated per-user API: data, market quotes and every portfolio operation (rules live in shared/service.js).
import { Router } from 'express';
import * as svc from '../../shared/service.js';
import { requireAuth, publicUser } from '../lib/auth.js';
import { buildContext, publicSettings } from '../lib/context.js';
import { createMongoStore } from '../lib/mongoStore.js';

export function accountRouter({ market }) {
  const r = Router();
  const store = createMongoStore();
  r.use(requireAuth);
  const uid = (req) => String(req.user._id);
  const ctxOf = () => buildContext(market);
  const quotesOf = (ctx) => ({ source: ctx.source, asOf: ctx.asOf, prices: ctx.quotes });

  r.get('/data', async (req, res) => {
    const ctx = await ctxOf();
    await svc.sync(store, uid(req), ctx);
    res.json({ user: publicUser(req.user), settings: publicSettings(ctx.settings), quotes: quotesOf(ctx), ...(await svc.loadAll(store, uid(req), ctx)) });
  });

  r.get('/quotes', async (req, res) => res.json(quotesOf(await ctxOf())));

  r.post('/sync', async (req, res) => {
    const ctx = await ctxOf();
    const events = await svc.sync(store, uid(req), ctx);
    res.json({ events, quotes: quotesOf(ctx), settings: publicSettings(ctx.settings) });
  });

  r.post('/portfolios', async (req, res) => res.status(201).json(await svc.createPortfolio(store, uid(req), req.body || {}, await ctxOf())));
  r.patch('/portfolios/:id', async (req, res) => res.json(await svc.updatePortfolio(store, uid(req), req.params.id, req.body || {})));
  r.delete('/portfolios/:id', async (req, res) => {
    await svc.deletePortfolio(store, uid(req), req.params.id);
    res.json({ ok: true });
  });

  r.post('/transactions', async (req, res) => res.status(201).json(await svc.addTransaction(store, uid(req), req.body || {}, await ctxOf())));
  r.post('/transactions/import', async (req, res) => {
    const { portfolioId, rows } = req.body || {};
    res.status(201).json(await svc.importTransactions(store, uid(req), portfolioId, rows, await ctxOf()));
  });
  r.delete('/transactions/:id', async (req, res) => {
    await svc.deleteTransaction(store, uid(req), req.params.id);
    res.json({ ok: true });
  });

  r.post('/orders', async (req, res) => res.status(201).json(await svc.placeOrder(store, uid(req), req.body || {}, await ctxOf())));
  r.delete('/orders/:id', async (req, res) => res.json(await svc.cancelOrder(store, uid(req), req.params.id)));

  r.post('/watchlists', async (req, res) => res.status(201).json(await svc.createWatchlist(store, uid(req), req.body || {}, await ctxOf())));
  r.patch('/watchlists/:id', async (req, res) => res.json(await svc.updateWatchlist(store, uid(req), req.params.id, req.body || {}, await ctxOf())));
  r.delete('/watchlists/:id', async (req, res) => {
    await svc.removeFrom(store, uid(req), 'watchlists', req.params.id);
    res.json({ ok: true });
  });

  r.post('/alerts', async (req, res) => res.status(201).json(await svc.createAlert(store, uid(req), req.body || {}, await ctxOf())));
  r.delete('/alerts/:id', async (req, res) => {
    await svc.removeFrom(store, uid(req), 'alerts', req.params.id);
    res.json({ ok: true });
  });

  r.post('/goals', async (req, res) => res.status(201).json(await svc.createGoal(store, uid(req), req.body || {}, await ctxOf())));
  r.patch('/goals/:id', async (req, res) => res.json(await svc.updateGoal(store, uid(req), req.params.id, req.body || {})));
  r.delete('/goals/:id', async (req, res) => {
    await svc.removeFrom(store, uid(req), 'goals', req.params.id);
    res.json({ ok: true });
  });

  r.post('/notifications/read', async (req, res) => {
    await svc.markNotificationsRead(store, uid(req));
    res.json({ ok: true });
  });

  r.post('/account/reset', async (req, res) => {
    await svc.resetUser(store, uid(req), await ctxOf());
    res.json({ ok: true });
  });

  return r;
}
