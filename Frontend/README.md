# Stock Market Portfolio - Frontend

React 19 + Vite app. It runs in two modes that offer the same features:

| Mode | Command | Data |
| --- | --- | --- |
| Full stack | `npm run dev` | Express API from `../Backend` (set `VITE_API_URL`), sign in with JWT |
| Live preview | `npm run dev:demo` | Built-in backend that runs the same shared account service, saved in your browser |

## Scripts

- `npm run dev` - development server (full-stack mode)
- `npm run dev:demo` - development server for the live preview
- `npm run build` - production build for a normal server
- `npm run build:pages` - production build for GitHub Pages (live preview, base path `/Stock-Market-Portfolio/`, hash routes)
- `npm run lint` - ESLint
- `npm test` - unit tests (Vitest)

Finance maths, validation, the market simulator and the account rules are imported from `../shared` through the `@shared` alias, so the API and the browser use exactly the same code.

See the repository README for features, roles, the API and deployment.
