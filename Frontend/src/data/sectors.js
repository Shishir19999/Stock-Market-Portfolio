// Sector classification for the sample catalogue (used by the Market filters).
const groups = {
  Technology: 'AAPL MSFT GOOGL INTC IBM ORCL CSCO QCOM TXN AMD ADBE CRM NVDA',
  'Consumer & Retail': 'AMZN NFLX WMT KO DIS PG PEP MCD NKE HD COST TGT SBUX EBAY TSLA',
  Financials: 'JPM BAC C WFC GS MS AXP V MA',
  Healthcare: 'PFE JNJ MRK ABT AMGN GILD TMO',
  'Industrials & Energy': 'XOM CVX COP BA CAT GE MMM HON UPS FDX LMT DE',
  'Telecom & Auto': 'T VZ F GM',
};

export const SECTOR_BY_SYMBOL = Object.fromEntries(
  Object.entries(groups).flatMap(([sector, list]) => list.split(' ').map((s) => [s, sector])),
);

export const SECTORS = Object.keys(groups);

export const sectorOf = (symbol) => SECTOR_BY_SYMBOL[symbol] || 'Other';
