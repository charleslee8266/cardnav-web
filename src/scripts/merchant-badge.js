/*
 * 文件说明: 创建共用的合作与赞赏商家 badge，供商品、商家和中转站动态列表复用。
 * 对应文档: docs/promo/cardnav-partner-offer.md
 */

window.CardNavMerchantBadge = {
  create(label = 'Partner', description = '', href = '', linkLabel = 'How to partner', kind = 'sponsor') {
    const group = document.createElement('span');
    group.className = 'merchant-badge-group';
    const badge = document.createElement('span');
    badge.className = 'merchant-badge';
    badge.dataset.kind = kind;
    const labelElement = document.createElement('span');
    labelElement.className = 'merchant-badge-label';
    labelElement.textContent = label;
    badge.appendChild(labelElement);
    group.appendChild(badge);
    if (description) {
      const info = document.createElement('span');
      info.className = 'merchant-badge-info';
      info.tabIndex = 0;
      info.setAttribute('role', 'img');
      info.setAttribute('aria-label', description);
      info.textContent = 'i';
      const tooltip = document.createElement('span');
      tooltip.className = 'merchant-badge-tooltip public-floating-layer';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.append(document.createTextNode(`${description} `));
      const link = document.createElement('a');
      link.className = 'merchant-badge-link';
      link.href = href;
      link.textContent = linkLabel;
      if (href) tooltip.appendChild(link);
      info.appendChild(tooltip);
      badge.appendChild(info);
    }
    return group;
  },
};

// 同时处理服务端和动态生成的 badge，将说明框保持在视口内。
function positionTooltip(event) {
  const info = event.target.closest?.('.merchant-badge-info');
  const tooltip = info?.querySelector('.merchant-badge-tooltip');
  if (!tooltip) return;
  tooltip.style.marginLeft = '';
  const bounds = tooltip.getBoundingClientRect();
  const edge = 16;
  const offset = Math.max(edge - bounds.left, Math.min(0, document.documentElement.clientWidth - edge - bounds.right));
  tooltip.style.marginLeft = `${offset}px`;
}
document.addEventListener('pointerover', positionTooltip);
document.addEventListener('focusin', positionTooltip);
