import { useState } from 'react';
import { Link } from 'react-router-dom';
import { allocate } from '@shared/finance.js';
import { sectorOf } from '@shared/sectors.js';
import { BENCHMARK_NAME } from '@shared/market.js';
import { useData, useTitle } from '../context/hooks.js';
import { Change, EmptyState, PageHeader, Segmented, Stat } from '../components/ui.jsx';
import LineChart from '../components/LineChart.jsx';
import DonutChart from '../components/DonutChart.jsx';
import { usePerformance, PERF_RANGES } from '../lib/usePerformance.js';
import { money, plainPct, pctFrac } from '../lib/format.js';

const num = (n) => (Number.isFinite(n) ? n.toFixed(2) : '—');

export default function Analytics() {
  useTitle('Analytics');
  const { portfolio } = useData();
  const [range, setRange] = useState('6M');
  const perf = usePerformance(range);
  const { positions, totals } = portfolio;
  const sectors = allocate(positions, 0, 'sector', { sectorOf });
  const weights = positions.map((p) => (totals.total > 0 ? p.value / totals.total : 0));
  const hhi = weights.reduce((s, w) => s + w * w, 0);
  const top = [...positions].sort((a, b) => b.value - a.value)[0];

  return (
    <>
      <PageHeader title="Analytics" subtitle="Performance, risk and diversification for the selected portfolio.">
        <Segmented label="Range" value={range} onChange={setRange} options={Object.keys(PERF_RANGES).map((k) => [k, k === 'ALL' ? 'All' : k])} />
      </PageHeader>

      {!perf ? (
        <div className="card"><EmptyState title="Not enough history yet" action={<Link to="/transactions" className="btn btn-primary">Add a transaction</Link>}>Risk metrics need at least two trading days of portfolio history.</EmptyState></div>
      ) : (
        <>
          <div className="grid kpis">
            <Stat label="Return" value={pctFrac(perf.risk.totalReturn)}><span className="muted small">Benchmark {pctFrac(perf.benchRisk.totalReturn)}</span></Stat>
            <Stat label="Volatility (annualised)" value={plainPct(perf.risk.volatility * 100)}><span className="muted small">Benchmark {plainPct(perf.benchRisk.volatility * 100)}</span></Stat>
            <Stat label="Sharpe ratio" value={num(perf.risk.sharpe)}><span className="muted small">Benchmark {num(perf.benchRisk.sharpe)} · risk-free 2%</span></Stat>
            <Stat label="Max drawdown" value={<span className="loss">{plainPct(perf.risk.maxDrawdown * 100)}</span>}><span className="muted small">Benchmark {plainPct(perf.benchRisk.maxDrawdown * 100)}</span></Stat>
          </div>

          <section className="card" aria-labelledby="idx-h">
            <h2 id="idx-h">Performance index</h2>
            <p className="small muted">Both lines start at 100. Deposits and withdrawals are excluded (time-weighted).</p>
            <LineChart
              label={`Portfolio index versus ${BENCHMARK_NAME}`}
              series={[{ name: 'Portfolio', color: 'var(--c1)', points: perf.portfolio }, { name: BENCHMARK_NAME, color: 'var(--c2)', dash: '6 4', points: perf.benchmark }]}
              valueFormat={(v) => v.toFixed(1)}
              area={false}
              allowNegative
            />
          </section>

          <div className="grid two">
            <section className="card" aria-labelledby="val-h">
              <h2 id="val-h">Portfolio value</h2>
              <LineChart label="Portfolio value over time" series={[{ name: 'Value', color: 'var(--c3)', points: perf.value }]} valueFormat={(v) => money(v)} height={240} />
            </section>
            <section className="card" aria-labelledby="dd-h">
              <h2 id="dd-h">Drawdown</h2>
              <LineChart label="Portfolio drawdown from its running peak" series={[{ name: 'Drawdown %', color: 'var(--loss)', points: perf.drawdown }]} valueFormat={(v) => `${v.toFixed(1)}%`} allowNegative height={240} />
            </section>
          </div>

          <section className="card" aria-labelledby="risk-h">
            <h2 id="risk-h">Risk summary</h2>
            <div className="table-wrap">
              <table>
                <caption className="sr-only">Portfolio risk metrics compared with the benchmark</caption>
                <thead><tr><th scope="col">Metric</th><th scope="col" className="num">Portfolio</th><th scope="col" className="num">{BENCHMARK_NAME}</th></tr></thead>
                <tbody>
                  <tr><th scope="row">Total return</th><td className="num"><Change value={perf.risk.totalReturn * 100} /></td><td className="num"><Change value={perf.benchRisk.totalReturn * 100} /></td></tr>
                  <tr><th scope="row">Annualised return (CAGR)</th><td className="num">{pctFrac(perf.risk.cagr)}</td><td className="num">{pctFrac(perf.benchRisk.cagr)}</td></tr>
                  <tr><th scope="row">Volatility</th><td className="num">{plainPct(perf.risk.volatility * 100)}</td><td className="num">{plainPct(perf.benchRisk.volatility * 100)}</td></tr>
                  <tr><th scope="row">Sharpe ratio</th><td className="num">{num(perf.risk.sharpe)}</td><td className="num">{num(perf.benchRisk.sharpe)}</td></tr>
                  <tr><th scope="row">Max drawdown</th><td className="num">{plainPct(perf.risk.maxDrawdown * 100)}</td><td className="num">{plainPct(perf.benchRisk.maxDrawdown * 100)}</td></tr>
                  <tr><th scope="row">Beta vs benchmark</th><td className="num">{num(perf.risk.beta)}</td><td className="num">1.00</td></tr>
                  <tr><th scope="row">Best day</th><td className="num">{pctFrac(perf.risk.best)}</td><td className="num">{pctFrac(perf.benchRisk.best)}</td></tr>
                  <tr><th scope="row">Worst day</th><td className="num">{pctFrac(perf.risk.worst)}</td><td className="num">{pctFrac(perf.benchRisk.worst)}</td></tr>
                </tbody>
              </table>
            </div>
            <p className="muted small">Computed from {perf.risk.days} trading days of simulated prices. Sharpe uses a 2% annual risk-free rate.</p>
          </section>
        </>
      )}

      <section className="card" aria-labelledby="div-h">
        <h2 id="div-h">Diversification</h2>
        {positions.length === 0 ? (
          <EmptyState title="No holdings">Sector exposure appears once you own stocks.</EmptyState>
        ) : (
          <div className="stack">
            <dl className="kv grid-kv">
              <div><dt>Holdings</dt><dd>{positions.length}</dd></div>
              <div><dt>Largest position</dt><dd>{top.symbol} ({plainPct((top.value / totals.total) * 100)})</dd></div>
              <div><dt>Concentration (HHI)</dt><dd>{hhi.toFixed(2)} {hhi > 0.4 ? '(concentrated)' : hhi > 0.2 ? '(moderate)' : '(diversified)'}</dd></div>
            </dl>
            <DonutChart slices={sectors} centerLabel="Stocks" centerValue={money(totals.invested)} />
          </div>
        )}
      </section>
    </>
  );
}
