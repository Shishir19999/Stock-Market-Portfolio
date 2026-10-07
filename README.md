# Stock Market Portfolio

**Live demo:** https://shishir19999.github.io/Stock-Market-Portfolio/

A portfolio and market app: browse stocks, track a watchlist with price alerts, paper-trade with virtual cash, and review your portfolio on a dashboard. Prices are simulated sample data, paper trading only, not financial advice.

**Stack:** React 19 + Vite 8 (Frontend), Express 5 + Mongoose 9 (Backend), MongoDB.

## Features
- Dashboard: total value, unrealized and daily P&L, allocation donut chart, top watchlist movers, holdings CSV export.
- Market: search, sector filter, sorting, top gainers and losers.
- Stock detail: interactive inline-SVG price chart (hover/keyboard tooltip, selectable ranges), buy/sell paper trading with validation (cash, holdings), price alerts.
- Watchlist, transaction history with CSV export, compare two stocks side by side.
- Light/dark theme (follows system, remembered), responsive from 320px, skeletons, empty/error states, toasts, confirm dialogs, 404 page.
- Parallax and scroll-reveal on the landing and dashboard header backgrounds only (transform/opacity, IntersectionObserver + requestAnimationFrame, no libraries). Disabled under `prefers-reduced-motion` and on small or low-power screens.

## Run modes
### Full stack (Express + MongoDB)
```bash
cd Backend && cp .env.example .env && npm install && npm start
cd Frontend && cp .env.example .env && npm install && npm run dev
```
Stocks and the watchlist come from the API; paper-trading data (cash, holdings, transactions, alerts) is stored in the browser.

### Browser-only demo (no server, no database)
```bash
cd Frontend
npm run dev:demo       # local demo
npm run build:pages    # static build for GitHub Pages (base /Stock-Market-Portfolio/, hash routes) -> Frontend/dist
```
The demo swaps the API layer for an in-browser backend (`VITE_DEMO=true`): about 60 stocks with simulated history, a paper-trading account with starting cash, a simulated live price ticker, localStorage persistence and a "Reset demo data" action. Demo sign-in details are shown on the login page.

## Tests
`cd Backend && npm test` and `cd Frontend && npm test` (plus `npm run lint`).

## Environment variables
- Backend: `PORT` (default 8080), `MONGODB_URL` (default `mongodb://localhost:27017/Stock_Market_Portfolio`).
- Frontend: `VITE_API_URL` (default `http://localhost:8080`).

## API
- `GET /api/stocks` - list stocks (`company`, `description`, `initial_price`, `price_2002`, `price_2007`, `symbol`).
- `POST /api/watchlist` - save a stock to the watchlist.

Seed data can be imported from `Full Stack/Mongodb/Stock_Market_Portfolio.stocks.json` into the `stocks` collection.

## Notes
- Price colour: green if `price_2007` is above `price_2002`, red if below.
- The watchlist is saved in MongoDB and reloaded on start.

## Demo data and watchlist API
`cd Backend && npm run seed` (idempotent, deterministic, database `stocks`) upserts 60 stocks by `symbol` into the `stocks` collection and 5 watchlist entries (AAPL, MSFT, NVDA, KO, JPM) into `watchlists`. No login is needed.

The watchlist is stored in its own `watchlists` collection (so it never pollutes the stock list):
- `GET /api/watchlist` - saved watchlist (the frontend loads it on start).
- `POST /api/watchlist` - `{ symbol, company, ... }`; `400` if invalid, `409` if the symbol is already saved.
- `DELETE /api/watchlist/:symbol`


## Deploy with Docker

Files: `Backend/Dockerfile`, `Frontend/Dockerfile` (Vite build served by nginx, SPA fallback in `Frontend/nginx.conf`), `.dockerignore` in both folders and `docker-compose.yml` here (mongo + backend + frontend).

```bash
cp .env.example .env      # optional: set CORS_ORIGIN / ports
docker compose up --build -d
```

- Frontend: http://localhost:8081 (`FRONTEND_PORT`), API: http://localhost:8080 (`BACKEND_PORT`). MongoDB is only reachable inside the compose network and its data lives in the `mongo-data` volume.
- `VITE_API_URL` is baked into the frontend bundle at build time and must be the address the **browser** uses to reach the backend (for a server: `http://<server-ip-or-domain>:8080`); rebuild with `docker compose build frontend` after changing it.
- `CORS_ORIGIN` must contain the origin the browser loads the frontend from (default `http://localhost:8081`); for a server use e.g. `http://<server-ip>:8081`.
- Seed demo data: `docker compose exec backend npm run seed` fails in the production image because the seed uses a dev dependency (`@faker-js/faker`); run the seed from your machine instead: `cd Backend && MONGODB_URL=mongodb://127.0.0.1:27017/stocks npm run seed` after temporarily publishing mongo (add `ports: ["27017:27017"]` to the `mongo` service).

> Note: these Docker files were written and reviewed but not built or run in the authoring environment (Docker engine was off).

## Open the app from a phone on the same Wi-Fi

1. Find the PC's LAN IP (`ipconfig` on Windows, look for the IPv4 address, e.g. `192.168.1.79`).
2. Start the backend bound to all interfaces (the default `HOST=0.0.0.0`) with the phone's origin allowed, and Vite with `--host`:
   ```bash
   # Backend
   CORS_ORIGIN=http://localhost:5173,http://192.168.1.79:5173 npm start
   # Frontend: the API URL must use the LAN IP, not localhost
   VITE_API_URL=http://192.168.1.79:8080 npm run dev -- --host 0.0.0.0 --port 5173
   ```
   (PowerShell: `$env:CORS_ORIGIN="..."; npm start`.)
3. Allow the two ports through Windows Firewall (first run usually prompts; otherwise add an inbound rule for TCP 8080 and 5173, "Private" network only).
4. On the phone (same network) open `http://192.168.1.79:5173`.

Without `CORS_ORIGIN` set the API accepts any origin. If the phone shows the page but API calls fail, `VITE_API_URL` still points at `localhost` or the origin is missing from `CORS_ORIGIN`.

## Tests

`cd Backend && npm test` (node:test + supertest) runs against a throwaway local database that is dropped afterwards (set `TEST_MONGO_URI` to change the server, default `mongodb://127.0.0.1:27017`).

## Pagination
`GET /api/stocks?page=1&limit=12&search=text` (search matches company, symbol or description; limit max 100) returns `{ data, page, limit, total, pages }`. The Stocks page has a search box and Prev/Next controls.
