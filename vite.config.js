import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'

// Same PORT as server.cjs (dotenv; matches `loadEnv` quirks in some Vite versions)
dotenv.config()

const apiPort = process.env.PORT || '3001'
const apiProxy = {
  '/api': {
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: true,
  },
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: apiProxy,
  },
  // `vite preview` does not use server.proxy unless mirrored here
  preview: {
    proxy: apiProxy,
  },
})