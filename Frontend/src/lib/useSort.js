import { useMemo, useState } from 'react';

/** Client-side column sorting for tables. cols: { key: (row) => comparable }. */
export function useSort(rows, cols, initial = { key: null, dir: 'asc' }) {
  const [sort, setSort] = useState(initial);
  const sorted = useMemo(() => {
    const get = cols[sort.key];
    if (!get) return rows;
    const m = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = get(a);
      const y = get(b);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * m;
    });
  }, [rows, cols, sort]);
  const toggle = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const aria = (key) => (sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none');
  return { rows: sorted, sort, toggle, aria };
}
