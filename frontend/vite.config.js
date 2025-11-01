import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
    plugins: [react()],
    server: {
        port: 3000,
        host: true, // Tillåt access från nätverket
        proxy: {
            '/api': {
                target: 'http://localhost:8000',
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, '')
            }
        }
    },
    preview: {
        host: true, // Tillåt access från nätverket
        port: process.env.PORT || 3000,
        allowedHosts: [
            '.railway.app', // Tillåt alla Railway-domäner
            'web-frontend.up.railway.app', // Specifik domän
            'frontend.up.railway.app' // Om den heter något annat
        ]
    }
})

