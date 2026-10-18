import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' 让构建产物可部署到任意静态托管的任意子路径（含本地 file:// 之外的目录）
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    host: true,
    port: 5273,
  },
  build: {
    // 不清空输出目录：dist/videos 有 27 个大文件，删除操作在本机沙箱下会被拦截
    emptyOutDir: false,
    target: 'es2018',
    cssCodeSplit: false,
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // 拆出 vendor，让首屏 JS 更小、更利于缓存
        manualChunks: {
          react: ['react', 'react-dom'],
        },
      },
    },
  },
})
