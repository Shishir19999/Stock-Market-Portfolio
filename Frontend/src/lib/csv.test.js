import { describe, expect, it } from 'vitest';
import { csvCell, toCsv } from './csv.js';

describe('csv', () => {
  it('quotes commas, quotes and newlines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(12.5)).toBe('12.5');
  });
  it('neutralises spreadsheet formulas in text but keeps negative numbers', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell(-5)).toBe('-5');
  });
  it('builds rows with a header', () => {
    const out = toCsv([{ n: 'A, Inc.', v: 1 }], [{ label: 'Name', value: (r) => r.n }, { label: 'Value', value: (r) => r.v }]);
    expect(out).toBe('Name,Value\r\n"A, Inc.",1\r\n');
  });
});
