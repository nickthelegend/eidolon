import { defineConfig } from 'vite';
export default defineConfig({ server: { port: Number(process.env.EIDOLON_WEB_PORT ?? 5173), proxy: { '/api': { target: `http://localhost:${process.env.EIDOLON_PORT ?? 8787}`, changeOrigin: true, rewrite: path => path.replace(/^\/api/, '') } } } });
