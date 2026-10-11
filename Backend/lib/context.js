import { DEFAULT_SETTINGS } from '../../shared/validate.js';
import { Audit, Setting, Stock } from './models.js';

export async function getSettings() {
  const doc = await Setting.findOne({ key: 'main' }).lean();
  const { _id, __v, key, ...rest } = doc || {};
  return { ...DEFAULT_SETTINGS, ...rest };
}

export async function saveSettings(settings) {
  await Setting.findOneAndUpdate({ key: 'main' }, { $set: settings, $setOnInsert: { key: 'main' } }, { upsert: true });
  return settings;
}

export const publicSettings = (s) => ({ allowSignups: s.allowSignups, startingCash: s.startingCash, commission: s.commission, marketSource: s.marketSource, refreshSeconds: s.refreshSeconds });

export async function audit(actor, action, target = '', detail = '') {
  await Audit.create({ actorId: actor ? String(actor._id || actor.id) : '', actorName: actor?.name || actor?.email || 'system', action, target, detail });
}

let stockCache = { at: 0, list: [] };
export async function getStocks() {
  if (Date.now() - stockCache.at > 30_000) {
    const rows = await Stock.find({ initial_price: { $gt: 0 } }).sort({ symbol: 1 }).lean();
    stockCache = { at: Date.now(), list: rows.map((r) => ({ symbol: String(r.symbol || '').toUpperCase(), company: r.company, initial_price: r.initial_price, price_2002: r.price_2002, price_2007: r.price_2007 })) };
  }
  return stockCache.list;
}
export const resetStockCache = () => {
  stockCache = { at: 0, list: [] };
};

/** Build the service context for one request. */
export async function buildContext(market) {
  const [settings, stocks] = await Promise.all([getSettings(), getStocks()]);
  const q = await market.quotes(stocks, settings);
  return { settings, now: () => Date.now(), quotes: q.prices, symbols: new Set(stocks.map((s) => s.symbol)), source: q.source, asOf: q.asOf, stocks };
}
