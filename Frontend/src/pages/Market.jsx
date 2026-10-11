import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { SECTORS } from '@shared/sectors.js';
import { sampleNews } from '@shared/market.js';
import { useData, useTitle, useToast } from '../context/hooks.js';
import { Change, EmptyState, PageHeader, Tabs, TabPanel } from '../components/ui.jsx';
import { Reveal } from '../components/Reveal.jsx';
import { filterStocks, paginate, SORTS } from '../lib/stocks.js';
import { downloadCsv, toCsv } from '../lib/download.js';
import { money, dateTime } from '../lib/format.js';

const PAGE = 12;

function MoverList({ title, rows, id }) {
  return (
    <section className="card" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <ul className="plain-list">
        {rows.map((s) => (
          <li key={s.symbol}>
            <Link to={`/stocks/${s.symbol}`}><strong>{s.symbol}</strong> <span className="muted small">{s.company}</span></Link>
            <span className="right">{money(s.price)} <Change value={s.changePct} /></span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Market() {
  useTitle('Market');
  const { stocks, watchlists, toggleWatch, prices, quotes } = useData();
  const toast = useToast();
  const [tab, setTab] = useState('browse');
  const [f, setF] = useState({ search: '', sector: 'all', trend: 'all', sort: 'name' });
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => filterStocks(stocks, f), [stocks, f]);
  const pg = paginate(filtered, page, PAGE);
  const watched = useMemo(() => new Set(watchlists.flatMap((w) => w.symbols)), [watchlists]);
  const byDay = useMemo(() => [...stocks].sort((a, b) => b.changePct - a.changePct), [stocks]);
  const news = useMemo(() => sampleNews(stocks, prices, quotes.asOf), [stocks, prices, quotes.asOf]);
  const set = (k) => (e) => {
    setF((x) => ({ ...x, [k]: e.target.value }));
    setPage(1);
  };

  const toggle = async (s) => {
    try {
      const msg = await toggleWatch(s.symbol);
      toast.success(msg);
    } catch (e) {
      toast.error(e.message);
    }
  };

  const exportCsv = () =>
    downloadCsv('market.csv', toCsv(filtered, [
      { label: 'Symbol', value: (s) => s.symbol }, { label: 'Company', value: (s) => s.company }, { label: 'Sector', value: (s) => s.sector },
      { label: 'Price', value: (s) => s.price.toFixed(2) }, { label: 'Today %', value: (s) => s.changePct.toFixed(2) }, { label: 'Since 2007 %', value: (s) => s.growth.toFixed(1) },
    ]));

  return (
    <>
      <PageHeader title="Market" subtitle={`${stocks.length} companies with ${quotes.source === 'simulated' ? 'simulated' : 'provider'} prices updating every few seconds.`}>
        <Link to="/screener" className="btn">Stock screener</Link>
        <Link to="/compare" className="btn">Compare stocks</Link>
      </PageHeader>
      <Tabs label="Market views" value={tab} onChange={setTab} tabs={[{ id: 'browse', label: 'Browse' }, { id: 'movers', label: 'Movers and news' }]} />

      <TabPanel id="browse" value={tab}>
        <section className="card flush" aria-label="Stock list">
          <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
            <div className="field grow">
              <label htmlFor="m-search">Search</label>
              <input id="m-search" type="search" placeholder="Company, symbol or description" value={f.search} onChange={set('search')} />
            </div>
            <div className="field">
              <label htmlFor="m-sector">Sector</label>
              <select id="m-sector" value={f.sector} onChange={set('sector')}>
                <option value="all">All sectors</option>
                {SECTORS.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-trend">2002–2007 trend</label>
              <select id="m-trend" value={f.trend} onChange={set('trend')}>
                <option value="all">Any</option><option value="up">Rose</option><option value="down">Fell</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="m-sort">Sort by</label>
              <select id="m-sort" value={f.sort} onChange={set('sort')}>
                {Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button type="button" className="btn" onClick={exportCsv}>Export CSV</button>
          </form>
          {pg.items.length === 0 ? (
            <EmptyState title="No stocks match" action={<button type="button" className="btn" onClick={() => { setF({ search: '', sector: 'all', trend: 'all', sort: 'name' }); setPage(1); }}>Clear filters</button>}>
              Try a different search or clear the filters.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Stocks with live price, daily change and growth since 2007</caption>
                <thead>
                  <tr>
                    <th scope="col">Company</th><th scope="col" className="hide-sm">Sector</th><th scope="col" className="num">Price</th>
                    <th scope="col" className="num">Today</th><th scope="col" className="num hide-sm">Since 2007</th><th scope="col"><span className="sr-only">Watch</span></th>
                  </tr>
                </thead>
                <tbody>
                  {pg.items.map((s) => (
                    <tr key={s.symbol}>
                      <th scope="row">
                        <Link to={`/stocks/${s.symbol}`}><strong>{s.symbol}</strong></Link> <span className="muted">{s.company}</span>
                        <div className="muted small hide-sm">{s.description}</div>
                      </th>
                      <td className="hide-sm">{s.sector}</td>
                      <td className="num">{money(s.price)}</td>
                      <td className="num"><Change value={s.changePct} /></td>
                      <td className="num hide-sm"><Change value={s.growth} digits={0} /></td>
                      <td className="num">
                        <button type="button" className="btn btn-sm" aria-pressed={watched.has(s.symbol)} onClick={() => toggle(s)} aria-label={`${watched.has(s.symbol) ? 'Remove' : 'Add'} ${s.symbol} ${watched.has(s.symbol) ? 'from' : 'to'} your watchlist`}>
                          {watched.has(s.symbol) ? '★' : '☆'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="pager" aria-label="Pagination">
            <button type="button" className="btn btn-sm" onClick={() => setPage(pg.page - 1)} disabled={pg.page <= 1}>Previous</button>
            <span aria-live="polite">Page {pg.page} of {pg.pages} · {pg.total} stocks</span>
            <button type="button" className="btn btn-sm" onClick={() => setPage(pg.page + 1)} disabled={pg.page >= pg.pages}>Next</button>
          </nav>
        </section>
      </TabPanel>

      <TabPanel id="movers" value={tab}>
        <div className="grid two">
          <Reveal><MoverList id="gain-h" title="Top gainers today" rows={byDay.slice(0, 6)} /></Reveal>
          <Reveal delay={60}><MoverList id="lose-h" title="Top losers today" rows={[...byDay].reverse().slice(0, 6)} /></Reveal>
        </div>
        <section className="card" aria-labelledby="news-h">
          <h2 id="news-h">Market headlines</h2>
          <p className="muted small">Sample headlines generated from the simulated price moves. They are not real news.</p>
          <ul className="plain-list">
            {news.map((n) => (
              <li key={n.id}>
                <span><Link to={`/stocks/${n.symbol}`}><strong>{n.symbol}</strong></Link> {n.text}</span>
                <span className="muted small">{dateTime(new Date(n.t).toISOString())} · <Change value={n.chg} /></span>
              </li>
            ))}
          </ul>
        </section>
      </TabPanel>
    </>
  );
}
