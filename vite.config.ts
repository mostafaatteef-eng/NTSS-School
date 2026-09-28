import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Vercel serves from the domain root; GitHub Pages serves from /NTSS-School/.
  // Keep both deployment targets valid instead of sharing an incompatible base.
  base: process.env.VERCEL === '1' ? '/' : (mode === 'production' ? '/NTSS-School/' : '/'),

  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },

  server: {
    port: 3000,
    host: '0.0.0.0',
    strictPort: true,
    hmr: process.env.DISABLE_HMR !== 'true',
  },
}));