import { defineConfig } from 'vite'

export default defineConfig({
  // Served from https://pbotwin.github.io/pi/ — assets must resolve under /pi/.
  base: '/pi/',
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: false,
  },
})
