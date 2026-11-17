import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages repository subpath auto-detection:
// If running in GitHub Actions, GITHUB_REPOSITORY is "owner/repo" -> base is "/repo/"
// Otherwise defaults to process.env.BASE_URL or "/" for local development.
const repoName = process.env.GITHUB_REPOSITORY
  ? `/${process.env.GITHUB_REPOSITORY.split('/')[1]}/`
  : '/';
const base = process.env.BASE_URL || repoName;

export default defineConfig({
  base,
  plugins: [
    tailwindcss(),
    react()
  ],
  server: {
    port: 3000,
    open: false
  }
});
