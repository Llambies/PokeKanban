import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createApi } from './server/api.mjs';

/** Serves the JSON storage API from the dev server too, so `npm run dev` is fully functional. */
function storageApi(): Plugin {
  return {
    name: 'pokekanban-storage-api',
    configureServer(server) {
      const api = createApi({ dataDir: process.env.POKEKANBAN_DATA_DIR ?? 'data' });
      server.middlewares.use((req, res, next) => {
        api(req, res)
          .then((handled) => {
            if (!handled) next();
          })
          .catch(next);
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), storageApi()],
  build: {
    chunkSizeWarningLimit: 1000,
  },
});
