import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        popup: `${rootDir}index.html`,
        'service-worker': `${rootDir}src/background/service-worker.ts`,
        'fill-form': `${rootDir}src/content/fill-form.ts`,
        'detect-login-page': `${rootDir}src/content/detect-login-page.ts`,
      },
      output: {
        entryFileNames: ({ name }) => {
          if (
            name === 'service-worker' ||
            name === 'fill-form' ||
            name === 'detect-login-page'
          ) {
            return `${name}.js`
          }

          return 'assets/[name]-[hash].js'
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
