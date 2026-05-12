import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/',
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 5173,
    strictPort: true,
    proxy: {
      '/api/fema': {
        target: 'https://hazards.fema.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/fema/, '/arcgis'),
      },
      '/api/nwi': {
        target: 'https://fwspublicservices.wim.usgs.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/nwi/, ''),
      },
      // Vite matches longest prefix first, so /api/census-geocoder beats /api/census.
      '/api/census-geocoder': {
        target: 'https://geocoding.geo.census.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/census-geocoder/, ''),
      },
      '/api/census': {
        target: 'https://api.census.gov',
        changeOrigin: true,
        timeout: 30000,
        rewrite: (path) => path.replace(/^\/api\/census/, ''),
      },
    },
  },
});
