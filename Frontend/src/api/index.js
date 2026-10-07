import { createDemoApi } from './demo.js';
import { createRealApi } from './real.js';

export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// VITE_DEMO=true swaps the HTTP client for the in-browser demo backend (same interface).
export const api = IS_DEMO ? createDemoApi() : createRealApi({ baseUrl: API_URL });
