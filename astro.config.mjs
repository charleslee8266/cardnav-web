/**
 * 文件说明: 配置 CardNav 公开站点的 Astro SSR 构建和 Node 独立运行入口。
 */
import node from '@astrojs/node';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  security: {
    allowedDomains: [
      {
        protocol: 'https',
        hostname: 'cardnav.xyz',
      },
      {
        protocol: 'https',
        hostname: 'www.cardnav.xyz',
      },
    ],
  },
  vite: {
    plugins: [tailwindcss()],
    build: {
      chunkSizeWarningLimit: 1100,
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 3000),
  },
});
