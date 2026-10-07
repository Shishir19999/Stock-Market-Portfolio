import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader } from '../components/ui.jsx';
import LineChart from '../components/LineChart.jsx';
import TradePanel from '../components/TradePanel.jsx';
import AlertPanel from '../components/AlertPanel.jsx';
import { IS_DEMO } from '../api/index.js';
import { generateHistory, RANGES, sliceRange } from '../lib/history.js';
import { money, number, tone } from '../lib/format.js';

const MAX_LIVE = 90;

export default function StockDetail() {
  const { symbol: raw } = useParams();
  const symbol = (raw || '').toUpperCase();
  const { bySymbol, watchSet, addToWatchlist, removeFromWatchlist, portfolio } = useData();
  const stock = bySymbol[symbol];
  useTitle(stock ? `${stock.symbol} - ${stock.company}` : 'Stock not found');

  const [range, setRange] = useState('ALL');
  const [live, setLive] = useState([]);
  const lastSymbol = useRef(symbol);

  const price = stock?.price;
  useEffect(() => {
    if (!IS_DEMO || price === undefined) return;
    setLive((prev) => {
      const base = lastSymbol.current === symbol ? prev : [];
      lastSymbol.current = symbol;
      return [...base, { t: Date.now(), price }].slice(-MAX_LIVE);
    });
  }, [price, symbol]);

  const history = useMemo(() => (stock ? generateHistory(stock) : []), [stock?.symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!stock) {
    return (
      <div className="card">
        <EmptyState title={`No stock with symbol "${raw}"`} action={<Link to="/stocks" className="btn btn-primary">Back to market</Link>}>
          Check the symbol or pick one from the market list.
        </EmptyState>
      </div>
    );
  }

  const points = range === 'LIVE' ? live : sliceRange(history, range);
  const first = points[0]?.price;
  const periodChange = first ? ((points[points.length - 1].price - first) / first) * 100 : 0;
  const position = portfolio.positions.find((p) => p.symbol === symbol);
  const watched = watchSet.has(symbol);
  const ranges = [...Object.keys(RANGES), ...(IS_DEMO ? ['LIVE'] : [])];

  return (
    <>
      <p className="crumbs"><Link to="/stocks">Market</Link> / {stock.symbol}</p>
      <PageHeader title={`${stock.company} (${stock.symbol})`} subtitle={`${stock.sector} · ${stock.description}`}>
        <button type="button" className="btn" onClick={() => (watched ? removeFromWatchlist(symbol) : addToWatchlist(stock))} aria-pressed={watched}>
          {watched ? '★ Watching' : '☆ Add to watchlist'}
        </button>
        <Link to={`/compare?a=${symbol}`} className="btn">Compare</Link>
      </PageHeader>

      <div className="grid detail">
        <div className="stack">
          <section className="card" aria-labelledby="chart-h">
            <div className="row between wrap">
              <div>
                <h2 id="chart-h" className="sr-only">Price history</h2>
                <div className="big-price">{money(stock.price)}</div>
                <span className="muted small">{range === 'LIVE' ? 'Live ticks' : RANGES[range].label} </span>
                <Change value={periodChange} />
              </div>
              <div className="segmented" role="group" aria-label="Chart range">
                {ranges.map((k) => (
                  <button key={k} type="button" className={range === k ? 'on' : ''} aria-pressed={range === k} onClick={() => setRange(k)}>
                    {k === 'LIVE' ? 'Live' : RANGES[k].label}
                  </button>
                ))}
              </div>
            </div>
            <LineChart
              key={range}
              live={range === 'LIVE'}
              label={`${stock.company} price history`}
              series={[{ name: stock.symbol, color: 'var(--c1)', points }]}
              valueFormat={(v) => money(v)}
            />
            <p className="muted small">History between the 2002, 2007 and current prices is modelled sample data.</p>
          </section>

          <section className="card" aria-labelledby="stats-h">
            <h2 id="stats-h">Key figures</h2>
            <dl className="kv grid-kv">
              <div><dt>Price in 2002</dt><dd>{money(stock.price_2002)}</dd></div>
              <div><dt>Price in 2007</dt><dd>{money(stock.price_2007)}</dd></div>
              <div><dt>Current price</dt><dd>{money(stock.price)}</dd></div>
              <div><dt>Change 2002 to 2007</dt><dd><Change value={((stock.price_2007 - stock.price_2002) / stock.price_2002) * 100} /></dd></div>
              <div><dt>Change since 2007</dt><dd><Change value={stock.growth} /></dd></div>
              <div><dt>Change since 2002</dt><dd><Change value={stock.growthSince2002} /></dd></div>
            </dl>
          </section>

          {position && (
            <section className="card" aria-labelledby="pos-h">
              <h2 id="pos-h">Your position</h2>
              <dl className="kv grid-kv">
                <div><dt>Shares</dt><dd>{number(position.shares)}</dd></div>
                <div><dt>Average cost</dt><dd>{money(position.avgCost)}</dd></div>
                <div><dt>Market value</dt><dd>{money(position.value)}</dd></div>
                <div><dt>Unrealized P&amp;L</dt><dd><span className={tone(position.pl)}>{money(position.pl)}</span> <Change value={position.plPct} /></dd></div>
              </dl>
            </section>
          )}
        </div>

        <div className="stack">
          <TradePanel stock={stock} />
          <AlertPanel symbol={symbol} />
        </div>
      </div>
    </>
  );
}
