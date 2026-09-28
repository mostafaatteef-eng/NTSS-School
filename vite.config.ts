import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => ({
  // Vercel serves from the domain root; GitHub Pages serves from /NTSS-School/.
  // Keep Vercel on the domain root and GitHub Pages on its explicit CI base path.
  base: process.env.VITE_BASE_PATH || (process.env.VERCEL === '1' ? '/' : (mode === 'production' ? '/NTSS-School/' : '/')),

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