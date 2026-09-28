import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  // Vercel serves this app from the domain root. A repository-name base is only
  // valid for GitHub Pages and causes production JS/CSS assets to 404 on Vercel.
  base: '/',

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