import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader } from '../components/ui.jsx';
import { SECTORS } from '../data/sectors.js';
import { SORTS, filterStocks, paginate } from '../lib/stocks.js';
import { downloadCsv, toCsv } from '../lib/csv.js';
import { money } from '../lib/format.js';

const PAGE_SIZE = 12;

export default function Market() {
  useTitle('Market');
  const { stocks, watchSet, addToWatchlist, removeFromWatchlist } = useData();
  const [params, setParams] = useSearchParams();
  const sector = params.get('sector') || 'all';
  const trend = params.get('trend') || 'all';
  const sort = params.get('sort') || 'name';
  const page = Number(params.get('page')) || 1;
  const urlSearch = params.get('q') || '';
  const [text, setText] = useState(urlSearch);

  const update = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v === 'all' || v === 1 ? next.delete(k) : next.set(k, String(v))));
    setParams(next, { replace: true });
  };

  // Debounced search box -> URL
  useEffect(() => {
    if (text.trim() === urlSearch) return undefined;
    const id = setTimeout(() => update({ q: text.trim(), page: 1 }), 250);
    return () => clearTimeout(id);
  });

  const filtered = useMemo(() => filterStocks(stocks, { search: urlSearch, sector, trend, sort }), [stocks, urlSearch, sector, trend, sort]);
  const view = paginate(filtered, page, PAGE_SIZE);
  const filtersActive = urlSearch || sector !== 'all' || trend !== 'all';

  const exportCsv = () =>
    downloadCsv(
      'stocks.csv',
      toCsv(filtered, [
        { label: 'Symbol', value: (s) => s.symbol },
        { label: 'Company', value: (s) => s.company },
        { label: 'Sector', value: (s) => s.sector },
        { label: 'Price 2002', value: (s) => s.price_2002 },
        { label: 'Price 2007', value: (s) => s.price_2007 },
        { label: 'Current price', value: (s) => s.price.toFixed(2) },
        { label: 'Change since 2007 %', value: (s) => s.growth.toFixed(2) },
      ]),
    );

  return (
    <>
      <PageHeader title="Market" subtitle={`${filtered.length} of ${stocks.length} stocks`}>
        <button type="button" className="btn" onClick={exportCsv} disabled={!filtered.length}>Export CSV</button>
      </PageHeader>

      <form className="card filters" role="search" onSubmit={(e) => e.preventDefault()}>
        <div className="field grow">
          <label htmlFor="q">Search</label>
          <input id="q" type="search" placeholder="Company, symbol or description" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="sector">Sector</label>
          <select id="sector" value={sector} onChange={(e) => update({ sector: e.target.value, page: 1 })}>
            <option value="all">All sectors</option>
            {SECTORS.map((s) => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="trend">2002 to 2007</label>
          <select id="trend" value={trend} onChange={(e) => update({ trend: e.target.value, page: 1 })}>
            <option value="all">All</option>
            <option value="up">Rose</option>
            <option value="down">Fell</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sort">Sort by</label>
          <select id="sort" value={sort} onChange={(e) => update({ sort: e.target.value, page: 1 })}>
            {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        {filtersActive && (
          <button type="button" className="btn btn-sm" onClick={() => { setText(''); setParams({}, { replace: true }); }}>Clear</button>
        )}
      </form>

      {view.total === 0 ? (
        <div className="card">
          <EmptyState title="No stocks match your filters" action={<button type="button" className="btn" onClick={() => { setText(''); setParams({}, { replace: true }); }}>Clear filters</button>}>
            Try a different search term or sector.
          </EmptyState>
        </div>
      ) : (
        <div className="card flush">
          <div className="table-wrap">
            <table>
              <caption className="sr-only">Stocks</caption>
              <thead>
                <tr>
                  <th scope="col">Company</th>
                  <th scope="col" className="hide-sm">Sector</th>
                  <th scope="col" className="num hide-sm">2002</th>
                  <th scope="col" className="num hide-sm">2007</th>
                  <th scope="col" className="num">Price</th>
                  <th scope="col" className="num">Since 2007</th>
                  <th scope="col"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {view.items.map((s) => {
                  const watched = watchSet.has(s.symbol);
                  return (
                    <tr key={s.symbol}>
                      <th scope="row">
                        <Link to={`/stocks/${s.symbol}`}><strong>{s.symbol}</strong></Link>
                        <div className="muted small">{s.company}</div>
                      </th>
                      <td className="hide-sm">{s.sector}</td>
                      <td className="num hide-sm">{money(s.price_2002)}</td>
                      <td className="num hide-sm">{money(s.price_2007)}</td>
                      <td className="num">{money(s.price)}</td>
                      <td className="num"><Change value={s.growth} /></td>
                      <td className="num">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => (watched ? removeFromWatchlist(s.symbol) : addToWatchlist(s))}
                          aria-pressed={watched}
                          aria-label={`${watched ? 'Remove' : 'Add'} ${s.symbol} ${watched ? 'from' : 'to'} watchlist`}
                        >
                          {watched ? '★ Watching' : '☆ Watch'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="pager">
            <button type="button" className="btn btn-sm" disabled={view.page <= 1} onClick={() => update({ page: view.page - 1 })}>Previous</button>
            <span aria-live="polite">Page {view.page} of {view.pages}</span>
            <button type="button" className="btn btn-sm" disabled={view.page >= view.pages} onClick={() => update({ page: view.page + 1 })}>Next</button>
          </div>
        </div>
      )}
    </>
  );
}
