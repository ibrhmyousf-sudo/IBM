import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

// GitHub Pages repository subpath auto-detection:
// If running in GitHub Actions, GITHUB_REPOSITORY is "owner/repo" -> base is "/repo/"
// Otherwise defaults to process.env.BASE_URL or "./" for portable relative paths.
const repoName = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : './';
const base = process.env.BASE_URL || repoName;

export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    react(),
    {
      name: 'dev-html-rewrite',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/index.dev.html';
          }
          next();
        });
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.dev.html')
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]'
      }
    }
  },
  server: {
    port: 3000,
    open: false,
    watch: {
      usePolling: true,
      interval: 1000
    }
  }
});
