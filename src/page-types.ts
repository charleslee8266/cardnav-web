/**
 * 文件说明: 定义公开站页面类型，供页面入口和赞助位 placement 共同使用。
 * 对应文档: docs/specs/public-page-types.md
 */
export const pageTypes = [
  'home',
  'shops',
  'shop-keyword',
  'gateway',
  'gateway-detail',
  'gateway-model-detail',
  'official-price',
  'official-price-detail',
  'model-leaderboard',
  'model-leaderboard-detail',
  'tools',
  'tool-detail',
  'guide',
  'guide-detail',
  'about',
  'partnership',
  'supporters',
  'privacy',
  'disclaimer',
] as const;

export type PageType = (typeof pageTypes)[number];
