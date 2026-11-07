import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// base './' — работает и на GitHub Pages, и внутри Telegram Mini App
export default defineConfig({ plugins: [react()], base: './' })
