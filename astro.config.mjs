/**
 * 文件说明: 配置 CardNav 公开站点的 Astro SSR 构建和 Node 独立运行入口。
 */
import node from '@astrojs/node';
import mdx from '@astrojs/mdx';
import tailwindcss from '@tailwindcss/vite';
/*
 * 文件说明: 配置公开站 Astro 构建、Tailwind 集成、开发热更新和前端脚本分包策略。
 */
import { defineConfig } from 'astro/config';

export default defineConfig({
  integrations: [mdx()],
  output: 'server',
  devToolbar: { enabled: false },
  // Caddy terminates HTTPS before forwarding requests to the local Node port.
  // The API applies its own strict PUBLIC_SITE_URL origin check, while Astro's
  // default check would compare against the internal proxy URL and reject it.
  security: {
    checkOrigin: false,
  },
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    server: { strictPort: true },
    plugins: [tailwindcss()],
    build: {
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 1100,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('/src/scripts/shops-merchant-view.js')) {
              return 'shops-merchant-view';
            }
            if (id.includes('/src/scripts/data-table.js')) {
              return 'data-table';
            }
            if (id.includes('/src/scripts/llm-gateway-home.js')) {
              return 'llm-gateway-home';
            }
          },
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 3101),
  },
});
