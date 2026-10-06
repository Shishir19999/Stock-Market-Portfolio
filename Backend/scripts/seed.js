// Idempotent seed: upserts 60 stocks by `symbol` plus 5 watchlist entries. Run with `npm run seed`.
// Deterministic: 15 hand-written real tickers + 45 more real tickers with faker-seeded (seed 303) prices.
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { faker } from '@faker-js/faker';

dotenv.config({ quiet: true });
faker.seed(303);

const base = [
  ['AAPL', 'Apple Inc.', 'Consumer electronics, software and services', 0.99, 0.30, 5.10],
  ['MSFT', 'Microsoft Corporation', 'Software, cloud computing and devices', 21.0, 26.5, 29.5],
  ['GOOGL', 'Alphabet Inc.', 'Search, advertising and cloud services', 85.0, 55.0, 330.0],
  ['AMZN', 'Amazon.com, Inc.', 'E-commerce and cloud infrastructure', 18.0, 17.5, 90.0],
  ['TSLA', 'Tesla, Inc.', 'Electric vehicles and clean energy', 17.0, 1.5, 3.0],
  ['NFLX', 'Netflix, Inc.', 'Subscription video streaming', 15.0, 0.9, 3.3],
  ['NVDA', 'NVIDIA Corporation', 'GPUs and AI computing platforms', 12.0, 0.9, 6.5],
  ['INTC', 'Intel Corporation', 'Semiconductors and microprocessors', 30.0, 17.0, 22.0],
  ['IBM', 'International Business Machines', 'Enterprise IT, consulting and hybrid cloud', 120.0, 82.0, 106.0],
  ['ORCL', 'Oracle Corporation', 'Database software and cloud applications', 40.0, 11.0, 20.0],
  ['JPM', 'JPMorgan Chase & Co.', 'Global banking and financial services', 45.0, 25.0, 46.0],
  ['KO', 'The Coca-Cola Company', 'Non-alcoholic beverages', 55.0, 24.0, 31.0],
  ['DIS', 'The Walt Disney Company', 'Media, parks and entertainment', 28.0, 18.0, 33.0],
  ['XOM', 'Exxon Mobil Corporation', 'Integrated oil and gas', 70.0, 33.0, 80.0],
  ['WMT', 'Walmart Inc.', 'Retail hypermarkets and e-commerce', 52.0, 47.0, 46.0],
];

// [symbol, company, description]; prices generated deterministically
const extra = [
  ['PFE', 'Pfizer Inc.', 'Pharmaceuticals and vaccines'], ['JNJ', 'Johnson & Johnson', 'Healthcare products and pharmaceuticals'],
  ['MRK', 'Merck & Co., Inc.', 'Pharmaceuticals and animal health'], ['PG', 'The Procter & Gamble Company', 'Consumer packaged goods'],
  ['PEP', 'PepsiCo, Inc.', 'Beverages and snack foods'], ['MCD', "McDonald's Corporation", 'Quick-service restaurants'],
  ['NKE', 'NIKE, Inc.', 'Athletic footwear and apparel'], ['HD', 'The Home Depot, Inc.', 'Home improvement retail'],
  ['BA', 'The Boeing Company', 'Commercial aircraft and defense systems'], ['CAT', 'Caterpillar Inc.', 'Construction and mining equipment'],
  ['GE', 'General Electric Company', 'Industrial conglomerate: aviation, power and healthcare'], ['F', 'Ford Motor Company', 'Automobiles and trucks'],
  ['GM', 'General Motors Company', 'Automobiles and mobility services'], ['T', 'AT&T Inc.', 'Telecommunications and media'],
  ['VZ', 'Verizon Communications Inc.', 'Wireless and broadband services'], ['CSCO', 'Cisco Systems, Inc.', 'Networking hardware and software'],
  ['QCOM', 'QUALCOMM Incorporated', 'Wireless chipsets and licensing'], ['TXN', 'Texas Instruments Incorporated', 'Analog and embedded semiconductors'],
  ['AMD', 'Advanced Micro Devices, Inc.', 'CPUs, GPUs and adaptive computing'], ['ADBE', 'Adobe Inc.', 'Creative and document software'],
  ['CRM', 'Salesforce, Inc.', 'Cloud CRM software'], ['EBAY', 'eBay Inc.', 'Online marketplace'],
  ['BAC', 'Bank of America Corporation', 'Consumer and investment banking'], ['C', 'Citigroup Inc.', 'Global banking and financial services'],
  ['WFC', 'Wells Fargo & Company', 'Retail and commercial banking'], ['GS', 'The Goldman Sachs Group, Inc.', 'Investment banking and securities'],
  ['MS', 'Morgan Stanley', 'Wealth management and investment banking'], ['AXP', 'American Express Company', 'Payments and credit cards'],
  ['V', 'Visa Inc.', 'Global payments network'], ['MA', 'Mastercard Incorporated', 'Global payments network'],
  ['CVX', 'Chevron Corporation', 'Integrated oil and gas'], ['COP', 'ConocoPhillips', 'Oil and gas exploration and production'],
  ['MMM', '3M Company', 'Diversified industrial and consumer products'], ['HON', 'Honeywell International Inc.', 'Aerospace, building and industrial technologies'],
  ['UPS', 'United Parcel Service, Inc.', 'Package delivery and logistics'], ['FDX', 'FedEx Corporation', 'Express transportation and logistics'],
  ['COST', 'Costco Wholesale Corporation', 'Membership warehouse retail'], ['TGT', 'Target Corporation', 'General merchandise retail'],
  ['SBUX', 'Starbucks Corporation', 'Coffee retail chain'], ['LMT', 'Lockheed Martin Corporation', 'Aerospace and defense'],
  ['DE', 'Deere & Company', 'Agricultural and construction machinery'], ['ABT', 'Abbott Laboratories', 'Medical devices and diagnostics'],
  ['AMGN', 'Amgen Inc.', 'Biotechnology therapeutics'], ['GILD', 'Gilead Sciences, Inc.', 'Antiviral and oncology drugs'],
  ['TMO', 'Thermo Fisher Scientific Inc.', 'Scientific instruments and lab services'],
];

const r2 = (n) => Math.round(n * 100) / 100;
const generated = extra.map(([symbol, company, description]) => {
  const initial = r2(faker.number.float({ min: 5, max: 150 }));
  const p2002 = r2(initial * faker.number.float({ min: 0.3, max: 1.4 }));
  const p2007 = r2(p2002 * faker.number.float({ min: 0.6, max: 3.0 }));
  return [symbol, company, description, initial, p2002, p2007];
});
const stocks = [...base, ...generated].map(([symbol, company, description, initial_price, price_2002, price_2007]) => (
  { symbol, company, description, initial_price, price_2002, price_2007 }
));
const watch = ['AAPL', 'MSFT', 'NVDA', 'KO', 'JPM'];

const uri = process.env.MONGODB_URL || 'mongodb://127.0.0.1:27017/stocks';
await mongoose.connect(uri);
const col = mongoose.connection.collection('stocks');
for (const s of stocks) {
  await col.updateOne({ symbol: s.symbol }, { $set: s }, { upsert: true });
}
const wl = mongoose.connection.collection('watchlists');
const now = new Date('2026-09-30T12:00:00Z');
for (const sym of watch) {
  const s = stocks.find((x) => x.symbol === sym);
  await wl.updateOne({ symbol: sym }, { $set: { ...s }, $setOnInsert: { createdAt: now, updatedAt: now, __v: 0 } }, { upsert: true });
}
console.log(`Seeded ${stocks.length} stocks (total: ${await col.countDocuments()}) and ${watch.length} watchlist entries (total: ${await wl.countDocuments()}) into "${mongoose.connection.name}".`);
await mongoose.disconnect();
