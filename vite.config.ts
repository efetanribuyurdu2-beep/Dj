import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' => uygulama GitHub Pages alt klasöründe veya herhangi bir yerde çalışır
export default defineConfig({
  base: './',
  plugins: [react()],
  worker: { format: 'es' },
  test: { environment: 'node' },
} as any);
