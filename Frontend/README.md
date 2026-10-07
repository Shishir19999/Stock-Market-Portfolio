# Stock Market Portfolio - Frontend

React 19 + Vite app. It runs in two modes:

| Mode | Command | Data |
| --- | --- | --- |
| Full stack | `npm run dev` | Express API from `../Backend` (set `VITE_API_URL`) |
| Browser-only demo | `npm run dev:demo` | Built-in demo backend, saved in your browser |

## Scripts

- `npm run dev` - development server (full-stack mode)
- `npm run dev:demo` - development server with the demo backend
- `npm run build` - production build for a normal server
- `npm run build:pages` - production build for GitHub Pages (demo backend, base path `/Stock-Market-Portfolio/`)
- `npm run lint` - ESLint
- `npm test` - unit tests (Vitest)

## Live demo

https://shishir19999.github.io/Stock-Market-Portfolio/

Prices in demo mode are simulated and are not financial advice. See the main `README.md` in the repository root for the full feature list, demo logins and backend setup.
