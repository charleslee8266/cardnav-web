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

/** 开发时修改文案/内容真源后，主动触发整页刷新，避免 SSR 页面仍显示旧文字。 */
function publicContentHotReload() {
  return {
    name: 'cardnav-public-content-hot-reload',
    handleHotUpdate({ file, server }) {
      if (
        /\/src\/i18n\//.test(file)
        || /\/content\/guide\//.test(file)
        || /\/content\/pages\/.*\.mdx$/.test(file)
        || /\/src\/page-content\.ts$/.test(file)
        || /\/src\/guide\.ts$/.test(file)
        || /\/src\/pages\/.*\.astro$/.test(file)
        || /\/src\/components\/.*\.astro$/.test(file)
      ) {
        server.ws.send({ type: 'full-reload' });
        return [];
      }
    },
  };
}

export default defineConfig({
  integrations: [mdx()],
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  vite: {
    plugins: [tailwindcss(), publicContentHotReload()],
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
