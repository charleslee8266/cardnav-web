/**
 * 文件说明: 为公开页面统计复用匿名浏览器标识，存储不可用时在当前页面复用。
 */
let pageVisitorId: string | undefined;
export function anonymousVisitorId(): string {
  if (pageVisitorId) return pageVisitorId;
  try {
    const stored = localStorage.getItem('cardnav.visitorId');
    if (stored && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(stored)) return pageVisitorId = stored;
  } catch { /* 禁用持久存储时仍可在当前页面统计。 */ }
  const id = crypto.randomUUID();
  pageVisitorId = id;
  try { localStorage.setItem('cardnav.visitorId', id); } catch { /* 当前页面继续复用。 */ }
  return id;
}
