// CSV serialisation (RFC 4180 quoting, spreadsheet formula-injection protection) and transaction import parsing.
import { normalizeTransaction } from './validate.js';

export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** columns: [{ label, value: (row) => any }] */
export function toCsv(rows, columns) {
  const lines = [columns.map((c) => csvCell(c.label)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => csvCell(c.value(row))).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/** Parse CSV text into an array of string arrays. Handles quotes, escaped quotes, CRLF and a BOM. */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell);
      cell = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

const ALIASES = {
  date: ['date', 'time', 'trade date', 'datetime'],
  type: ['type', 'side', 'action'],
  symbol: ['symbol', 'ticker'],
  shares: ['shares', 'quantity', 'qty'],
  price: ['price', 'unit price'],
  fee: ['fee', 'fees', 'commission'],
  amount: ['amount', 'total', 'value'],
  note: ['note', 'notes', 'memo'],
};
const TYPE_WORDS = { buy: 'buy', bought: 'buy', sell: 'sell', sold: 'sell', dividend: 'dividend', div: 'dividend', deposit: 'deposit', withdraw: 'withdraw', withdrawal: 'withdraw' };
const MAX_ROWS = 2000;

/**
 * Parse a transactions CSV. Returns { rows: [{ line, tx }], errors: [{ line, message }] }.
 * The header row is required; columns may come in any order and with common aliases.
 */
export function parseTransactionsCsv(text, options = {}) {
  const table = parseCsv(text);
  if (table.length < 2) return { rows: [], errors: [{ line: 1, message: 'The file needs a header row and at least one transaction.' }] };
  const header = table[0].map((h) => h.trim().toLowerCase());
  const col = {};
  for (const [key, names] of Object.entries(ALIASES)) col[key] = header.findIndex((h) => names.includes(h));
  const missing = ['date', 'type'].filter((k) => col[k] < 0);
  if (missing.length) return { rows: [], errors: [{ line: 1, message: `Missing required column: ${missing.join(', ')}.` }] };
  if (table.length - 1 > MAX_ROWS) return { rows: [], errors: [{ line: 1, message: `Too many rows (maximum ${MAX_ROWS}).` }] };
  const rows = [];
  const errors = [];
  table.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (k) => (col[k] >= 0 ? (cells[col[k]] ?? '').trim() : '');
    const word = get('type').toLowerCase();
    try {
      const tx = normalizeTransaction(
        {
          date: get('date'), type: TYPE_WORDS[word] || word, symbol: get('symbol'), shares: get('shares'),
          price: get('price').replace(/^\$/, ''), fee: get('fee').replace(/^\$/, ''), amount: get('amount').replace(/^\$/, ''), note: get('note'),
        },
        options,
      );
      rows.push({ line, tx });
    } catch (e) {
      errors.push({ line, message: e.message });
    }
  });
  return { rows, errors };
}

export const TRANSACTION_COLUMNS = [
  { label: 'Date', value: (t) => t.date.slice(0, 10) },
  { label: 'Type', value: (t) => t.type },
  { label: 'Symbol', value: (t) => t.symbol || '' },
  { label: 'Shares', value: (t) => (t.shares ?? '') },
  { label: 'Price', value: (t) => (t.price ?? '') },
  { label: 'Fee', value: (t) => (t.fee ? t.fee : '') },
  { label: 'Amount', value: (t) => (t.amount ?? '') },
  { label: 'Note', value: (t) => t.note || '' },
];
