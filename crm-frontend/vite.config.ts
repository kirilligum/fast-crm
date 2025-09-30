import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0', // Allow external connections
    port: 3000,
    allowedHosts: [
      'localhost',
      '.serveo.net', // Allow all serveo.net subdomains
      'b3fc53b2450c81c5ed9372cf6079a1f7.serveo.net' // Your specific domain
    ]
  }
})
