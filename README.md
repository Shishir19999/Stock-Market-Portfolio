# Stock Market Portfolio

A small MERN app that lists stocks from MongoDB and lets you add them to a watchlist.

**Stack:** React 19 + Vite 8 + MUI 9 (Frontend), Express 5 + Mongoose 9 (Backend), MongoDB.

Requires Node.js 24 LTS (Docker images: node:24, nginx:1.30, mongo:8.0).

## Setup
```bash
# Backend
cd Backend
cp .env.example .env     # set MONGODB_URL
npm install
npm start                # or: npm run dev

# Frontend
cd Frontend
cp .env.example .env     # VITE_API_URL must match the backend port
npm install
npm run dev              # npm run build for production
```

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
