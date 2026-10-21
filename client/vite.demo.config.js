import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const shim = (f) => fileURLToPath(new URL(`./demo/shims/${f}`, import.meta.url));

// Construit une page unique où l'API Node tourne dans le navigateur (aucun serveur requis).
export default defineConfig({
  root: fileURLToPath(new URL('./demo', import.meta.url)),
  plugins: [react(), viteSingleFile()],
  define: { 'process.env': '{}' },
  resolve: {
    alias: {
      'node:sqlite': shim('sqlite.js'),
      'node:crypto': shim('crypto.js'),
      'node:fs': shim('node.js'),
      'node:path': shim('node.js'),
      'node:url': shim('node.js'),
      express: shim('express.js'),
      nodemailer: shim('empty.js'),
      fs: shim('empty.js'),
      path: shim('empty.js'),
      crypto: shim('empty.js'),
    },
  },
  server: { fs: { allow: ['..', '../..'] } },
  build: { target: 'es2022', outDir: fileURLToPath(new URL('./dist-demo', import.meta.url)), emptyOutDir: true, chunkSizeWarningLimit: 5000 },
});
