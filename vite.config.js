import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { materialsFolderPlugin } from './vite-plugin-materials-folder.js'

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    materialsFolderPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'AI电路板辅助维修系统',
        short_name: '电路板维修',
        description: '电路板实拍图识别与维修步骤生成',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        start_url: './',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/web-img/baidu': {
        target: 'https://image.baidu.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/web-img\/baidu/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            )
            proxyReq.setHeader('Referer', 'https://image.baidu.com/')
            proxyReq.setHeader('Accept-Language', 'zh-CN,zh;q=0.9')
          })
        }
      },
      '/web-img/bing': {
        target: 'https://www.bing.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/web-img\/bing/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            )
            proxyReq.setHeader('Accept-Language', 'zh-CN,zh;q=0.9,en;q=0.8')
          })
        }
      }
    }
  },
  preview: {
    host: '127.0.0.1',
    port: 4173
  }
})
