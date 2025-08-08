import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Use an env variable so the dev server inside Docker can talk to the API container
// Fall back to localhost so running `npm run dev` on the host still works
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_URL || 'http://localhost:3000'

  return {
    plugins: [react()],
    server: {
      port: 3001,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true
        }
      }
    },
    build: {
      outDir: 'dist'
    }
  }
})