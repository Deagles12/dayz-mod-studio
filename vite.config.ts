import { defineConfig } from 'vite'
import tailwind from '@tailwindcss/vite'
export default defineConfig(({ command }) => ({
  plugins: [tailwind()],
  publicDir: command === 'serve' ? 'public' : false,
  server: { host: '127.0.0.1', port: 1420, strictPort: true },
}))
