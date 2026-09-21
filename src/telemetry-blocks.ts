/**
 * 文件说明: 按页面集中定义公开站统计模块名，供页面布局和组件声明事件来源。
 * 共享模块跨页面复用；名称不随语言、响应式布局或动态对象改变。
 */
export const telemetryBlocks = {
  // 全站共享模块
  shared: {
    page: 'page', // 未落入具体模块的页面级事件
    header: 'header', // 顶部导航、语言选择和主题切换
    announcement: 'announcement', // 站点公告
    hero: 'hero', // 页面介绍和主要行动入口
    footer: 'footer', // 页脚导航
  },
  // 首页 /
  home: {
    quickNavigation: 'quick-navigation', // 快捷导航
    highlights: 'home-highlights', // 内容推荐区
    search: 'home-search', // 商家搜索表单
    shops: 'shop-highlights', // 商家与商品推荐
    gateways: 'gateway-highlights', // 中转站与模型推荐
    officialPrices: 'official-price-highlights', // 官方订阅比价推荐
    models: 'model-highlights', // 模型排行推荐
    guide: 'guide-highlights', // 使用向导推荐
    tools: 'tool-highlights', // 实用工具推荐
  },
  // 商家页 /shops 及关键词页面
  shops: {
    products: 'shop-product-table', // 商品表格，包含对应筛选、排序、收藏和加载更多
    merchants: 'shop-merchant-table', // 商家表格，包含对应筛选、排序、收藏和加载更多
    guide: 'shop-guide', // 商家选购指南入口
    submit: 'shop-submit', // 商家提交弹窗
  },
  // 中转站 /llm-gateway 及站点、模型详情页
  gateways: {
    sites: 'gateway-site-table', // 站点表格（列表页和模型详情页），包含筛选、排序和加载更多
    models: 'gateway-model-table', // 列表页模型表格，包含筛选、排序和加载更多
    prices: 'gateway-price-table', // 站点详情价格表
    submit: 'gateway-submit', // 中转站提交弹窗
  },
  // 官方订阅 /official-price 及套餐详情页
  officialPrices: {
    table: 'official-price-table', // 地区价格表及订阅导航
  },
  // 模型排行 /model-leaderboard 及任务详情页
  modelLeaderboard: {
    table: 'model-leaderboard-table', // 任务导航与模型排行表
  },
  // 向导 /guide 及文章页
  guide: {
    navigation: 'guide-navigation', // 文章目录
    content: 'guide-content', // 文章正文及卡片
    next: 'guide-next', // 下一步文章入口
  },
  // 工具 /tools 及工具详情页
  tools: {
    list: 'tool-list', // 工具列表
    ipPurity: 'ip-purity', // IP 检测操作与结果
    sessionConverter: 'session-converter', // 凭证转换的输入、输出和操作
  },
  // 内容页 /about、/privacy、/disclaimer、/partnership
  content: {
    article: 'article', // 关于、隐私政策和免责声明正文
    partnership: 'partnership-content', // 合作说明和联系入口
  },
  // 跨页面复用的赞赏入口与弹窗
  support: {
    entry: 'support-entry', // 赞赏按钮与直接打开赞赏弹窗的入口
    dialog: 'support-dialog', // 赞赏身份、支付和到账确认流程
  },
  // 跨页面复用的赞助模块，按组件 placement 取值
  sponsors: {
    'page-bottom': 'sponsor-page-bottom', // 页面底部赞助区
    'after-hero': 'sponsor-after-hero', // Hero 后的赞助区
    'content-bottom': 'sponsor-content-bottom', // 正文后的赞助区
  },
} as const;
