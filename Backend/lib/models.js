import mongoose from 'mongoose';
import { DEFAULT_SETTINGS } from '../../shared/validate.js';

const { Schema } = mongoose;
const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

export const User = model('User', new Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
}, { timestamps: true }));

export const Setting = model('Setting', new Schema({
  key: { type: String, unique: true },
  allowSignups: { type: Boolean, default: DEFAULT_SETTINGS.allowSignups },
  startingCash: { type: Number, default: DEFAULT_SETTINGS.startingCash },
  commission: { type: Number, default: DEFAULT_SETTINGS.commission },
  marketSource: { type: String, default: DEFAULT_SETTINGS.marketSource },
  refreshSeconds: { type: Number, default: DEFAULT_SETTINGS.refreshSeconds },
}));

export const Audit = model('Audit', new Schema({
  at: { type: Date, default: Date.now, index: true },
  actorId: String,
  actorName: String,
  action: String,
  target: String,
  detail: String,
}));

// Per-user collections. All dates are ISO strings so documents look the same in the browser-only backend.
const owned = (fields) => new Schema({ userId: { type: String, required: true, index: true }, ...fields }, { minimize: false });
const S = String;
const N = Number;
export const FIELDS = {
  portfolios: { name: S, method: S, targets: { type: Schema.Types.Mixed, default: {} }, createdAt: S },
  transactions: { portfolioId: { type: S, index: true }, type: S, date: S, symbol: S, shares: N, price: N, fee: N, amount: N, note: S },
  orders: {
    portfolioId: { type: S, index: true }, symbol: S, side: S, type: S, shares: N, limitPrice: N, stopPrice: N, status: S,
    createdAt: S, filledAt: S, fillPrice: N, reason: S, txId: S,
  },
  watchlists: { name: S, symbols: [S] },
  alerts: { symbol: S, direction: S, target: N, createdAt: S, triggeredAt: S },
  goals: { name: S, target: N, portfolioId: S, deadline: S, monthly: N, returnPct: N, createdAt: S },
  notifications: { text: S, kind: S, date: S, read: Boolean },
};
export const OWNED = Object.fromEntries(Object.entries(FIELDS).map(([k, f]) => [k, model(`U_${k}`, owned(f))]));

// Sample catalogue and the legacy global watchlist (kept for API compatibility).
export const Stock = model('Stock', new Schema({
  company: String, description: String, initial_price: Number, price_2002: Number, price_2007: Number, symbol: String,
}));
export const Watchlist = model('Watchlist', new Schema({
  symbol: { type: String, required: true, unique: true, uppercase: true, trim: true },
  company: String, description: String, initial_price: Number, price_2002: Number, price_2007: Number,
}, { timestamps: true }));
