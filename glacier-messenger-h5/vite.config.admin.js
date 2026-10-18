import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

// 后台独立构建：输出 dist-admin，与游戏主包 dist 完全隔离，互不影响
const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: resolve(here, 'admin'),
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: resolve(here, 'dist-admin'),
    emptyOutDir: true,
    target: 'es2018',
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
  },
  server: {
    host: true,
    port: 5274,
  },
})
