import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Demo mode (static, browser-only) is enabled by VITE_DEMO=true or `--mode pages` / `--mode demo`.
// `npm run build:pages` builds it for GitHub Pages under /Stock-Market-Portfolio/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', 'VITE_');
  const demo = mode === 'pages' || mode === 'demo' || env.VITE_DEMO === 'true';
  return {
    base: mode === 'pages' ? '/Stock-Market-Portfolio/' : env.VITE_BASE || '/',
    plugins: [react()],
    define: { 'import.meta.env.VITE_DEMO': JSON.stringify(demo ? 'true' : 'false') },
    test: {
      environment: 'node',
      include: ['src/**/*.test.{js,jsx}'],
    },
  };
});
