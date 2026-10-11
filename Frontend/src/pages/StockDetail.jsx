import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { rsi as rsiCalc, stockMetrics } from '@shared/analytics.js';
import { DAILY_RANGES, sliceDays } from '@shared/market.js';
import { useData, useTitle, useToast } from '../context/hooks.js';
import { Change, EmptyState, PageHeader, Segmented } from '../components/ui.jsx';
import LineChart from '../components/LineChart.jsx';
import PriceChart from '../components/PriceChart.jsx';
import { INDICATORS } from '../components/indicators.js';
import TradePanel from '../components/TradePanel.jsx';
import AlertPanel from '../components/AlertPanel.jsx';
import { money, number, tone, plainPct } from '../lib/format.js';

const MAX_LIVE = 90;
const RANGE_LABELS = { '1M': '1M', '3M': '3M', '6M': '6M', '1Y': '1Y', '2Y': '2Y', ALL: 'All' };

export default function StockDetail() {
  const { symbol: raw } = useParams();
  const symbol = (raw || '').toUpperCase();
  const { bySymbol, watchlists, toggleWatch, portfolios, valueOf, seriesFor } = useData();
  const toast = useToast();
  const stock = bySymbol[symbol];
  useTitle(stock ? `${stock.symbol} - ${stock.company}` : 'Stock not found');

  const [range, setRange] = useState('6M');
  const [mode, setMode] = useState('candle');
  const [overlays, setOverlays] = useState(['sma20']);
  const [showRsi, setShowRsi] = useState(false);
  const [live, setLive] = useState([]);
  const lastSymbol = useRef(symbol);

  const price = stock?.price;
  useEffect(() => {
    if (price === undefined) return;
    // Collect ticks for the "Live" view; the buffer restarts when the symbol changes.
    setLive((prev) => {
      const base = lastSymbol.current === symbol ? prev : [];
      lastSymbol.current = symbol;
      return [...base, { t: Date.now(), price }].slice(-MAX_LIVE);
    });
  }, [price, symbol]);

  const candles = useMemo(() => (stock ? seriesFor(symbol) : []), [stock, symbol, seriesFor]);
  const metrics = useMemo(() => (candles.length > 250 ? stockMetrics(candles) : null), [candles]);
  const rsiNow = useMemo(() => (candles.length ? rsiCalc(candles.map((c) => c.c), 14).at(-1) : null), [candles]);

  if (!stock) {
    return (
      <div className="card">
        <EmptyState title={`No stock with symbol "${raw}"`} action={<Link to="/stocks" className="btn btn-primary">Back to market</Link>}>
          Check the symbol or pick one from the market list.
        </EmptyState>
      </div>
    );
  }

  const isLive = range === 'LIVE';
  const win = isLive ? [] : sliceDays(candles, range);
  const periodChange = win.length > 1 ? ((win[win.length - 1].c - win[0].c) / win[0].c) * 100 : 0;
  const watched = watchlists.some((w) => w.symbols.includes(symbol));
  const positions = portfolios.map((p) => ({ p, pos: valueOf(p.id).positions.find((x) => x.symbol === symbol) })).filter((x) => x.pos);
  const toggleOverlay = (k) => setOverlays((o) => (o.includes(k) ? o.filter((x) => x !== k) : [...o, k]));
  const ranges = [...Object.keys(DAILY_RANGES), 'LIVE'];
  const onWatch = async () => {
    try {
      toast.success(await toggleWatch(symbol));
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <>
      <p className="crumbs"><Link to="/stocks">Market</Link> / {stock.symbol}</p>
      <PageHeader title={`${stock.company} (${stock.symbol})`} subtitle={`${stock.sector} · ${stock.description}`}>
        <button type="button" className="btn" onClick={onWatch} aria-pressed={watched}>{watched ? '★ Watching' : '☆ Add to watchlist'}</button>
        <Link to={`/compare?a=${symbol}`} className="btn">Compare</Link>
      </PageHeader>

      <div className="grid detail">
        <div className="stack">
          <section className="card" aria-labelledby="chart-h">
            <h2 id="chart-h" className="sr-only">Price chart</h2>
            <div className="row between wrap">
              <div>
                <div className="big-price">{money(stock.price)}</div>
                <Change value={stock.changePct} /> <span className="muted small">today</span>
                {!isLive && <div className="small"><span className="muted">{RANGE_LABELS[range]} </span><Change value={periodChange} /></div>}
              </div>
              <Segmented label="Chart range" value={range} onChange={setRange} options={ranges.map((k) => [k, k === 'LIVE' ? 'Live' : RANGE_LABELS[k]])} />
            </div>
            {!isLive && (
              <div className="chart-tools row wrap" role="group" aria-label="Chart options">
                <Segmented label="Chart type" value={mode} onChange={setMode} options={[['candle', 'Candles'], ['line', 'Line']]} />
                {Object.entries(INDICATORS).map(([k, v]) => (
                  <label key={k} className="check"><input type="checkbox" checked={overlays.includes(k)} onChange={() => toggleOverlay(k)} /> {v.label}</label>
                ))}
                <label className="check"><input type="checkbox" checked={showRsi} onChange={() => setShowRsi((v) => !v)} /> RSI (14)</label>
              </div>
            )}
            {isLive ? (
              <LineChart live label={`${stock.company} live price`} series={[{ name: stock.symbol, color: 'var(--c1)', points: live }]} valueFormat={(v) => money(v)} />
            ) : (
              <PriceChart candles={candles} days={DAILY_RANGES[range]} mode={mode} overlays={overlays} showRsi={showRsi} label={`${stock.company} ${mode === 'candle' ? 'candlestick' : 'line'} chart, ${RANGE_LABELS[range]}`} />
            )}
            <p className="muted small">Daily history is modelled from the sample 2002, 2007 and current prices. Indicators (SMA, EMA, RSI) are computed from it.</p>
          </section>

          <section className="card" aria-labelledby="stats-h">
            <h2 id="stats-h">Key figures</h2>
            <dl className="kv grid-kv">
              <div><dt>Day change</dt><dd><Change value={stock.changePct} /></dd></div>
              <div><dt>Previous close</dt><dd>{money(stock.prev)}</dd></div>
              {metrics && <div><dt>52-week high</dt><dd>{money(metrics.hi52)}</dd></div>}
              {metrics && <div><dt>52-week low</dt><dd>{money(metrics.lo52)}</dd></div>}
              {metrics && <div><dt>1-year return</dt><dd><Change value={metrics.ret1Y * 100} /></dd></div>}
              {metrics && <div><dt>Volatility (annualised)</dt><dd>{plainPct(metrics.volatility * 100)}</dd></div>}
              {rsiNow !== null && <div><dt>RSI (14)</dt><dd>{rsiNow.toFixed(1)} {rsiNow > 70 ? '(overbought)' : rsiNow < 30 ? '(oversold)' : ''}</dd></div>}
              {metrics && <div><dt>Trend</dt><dd>{metrics.aboveSma50 ? 'Above' : 'Below'} 50-day average</dd></div>}
              {metrics && <div><dt>Average volume (30d)</dt><dd>{number(Math.round(metrics.avgVolume))}</dd></div>}
              <div><dt>Price in 2002</dt><dd>{money(stock.price_2002)}</dd></div>
              <div><dt>Price in 2007</dt><dd>{money(stock.price_2007)}</dd></div>
              <div><dt>Change since 2007</dt><dd><Change value={stock.growth} /></dd></div>
            </dl>
          </section>

          {positions.length > 0 && (
            <section className="card" aria-labelledby="pos-h">
              <h2 id="pos-h">Your position</h2>
              {positions.map(({ p, pos }) => (
                <div key={p.id} className="stack-sm pos-block">
                  <h3>{p.name}</h3>
                  <dl className="kv grid-kv">
                    <div><dt>Shares</dt><dd>{number(pos.shares)}</dd></div>
                    <div><dt>Average cost</dt><dd>{money(pos.avgCost)}</dd></div>
                    <div><dt>Market value</dt><dd>{money(pos.value)}</dd></div>
                    <div><dt>Unrealized P&amp;L</dt><dd><span className={tone(pos.pl)}>{money(pos.pl)}</span> <Change value={pos.plPct} /></dd></div>
                  </dl>
                </div>
              ))}
            </section>
          )}
        </div>

        <div className="stack">
          <TradePanel key={symbol} stock={stock} />
          <AlertPanel symbol={symbol} />
        </div>
      </div>
    </>
  );
}
