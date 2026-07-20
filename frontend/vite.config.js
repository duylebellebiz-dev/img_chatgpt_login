import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Lets the ngrok tunnel (used for local Facebook/Instagram OAuth testing,
    // since Meta requires a public https redirect_uri) reach this dev server
    // — Vite blocks unrecognized Host headers by default.
    allowedHosts: ['resurrect-unseated-prissy.ngrok-free.dev'],
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/media': 'http://127.0.0.1:8000',
    },
  },
})
