/*
文件说明: 监听商品与商家确认后的外跳，逐次上报点击明细；取消提醒不触发上报。
*/
export function trackProductClicks(tracker) {
  const activate = event => {
    if (event.defaultPrevented || (event.type === 'auxclick' ? event.button !== 1 : event.button !== 0)) return;
    const target = event.target instanceof Element ? event.target.closest('[data-product-click-id], [data-merchant-click-id]') : null;
    if (target instanceof HTMLElement) tracker.click(target);
  };
  document.addEventListener('click', activate);
  document.addEventListener('auxclick', activate);
}
