/*
 * 文件说明: 创建公开页面统一使用的合作 badge，供商品、商家和中转站动态列表复用。
 * 对应文档: docs/promo/cardnav-partner-offer.md
 */

window.CardNavSponsorBadge = {
  create(label = 'Partner', description = '', href = '/partnership', linkLabel = 'How to partner') {
    const group = document.createElement('span');
    group.className = 'sponsor-badge-group';
    const badge = document.createElement('span');
    badge.className = 'sponsor-badge';
    const labelElement = document.createElement('span');
    labelElement.textContent = label;
    badge.appendChild(labelElement);
    group.appendChild(badge);
    if (description) {
      const info = document.createElement('span');
      info.className = 'sponsor-badge-info';
      info.tabIndex = 0;
      info.setAttribute('role', 'img');
      info.setAttribute('aria-label', description);
      info.textContent = 'i';
      const tooltip = document.createElement('span');
      tooltip.className = 'sponsor-badge-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.append(document.createTextNode(`${description} `));
      const link = document.createElement('a');
      link.className = 'sponsor-badge-link';
      link.href = href;
      link.textContent = linkLabel;
      tooltip.appendChild(link);
      info.appendChild(tooltip);
      badge.appendChild(info);
    }
    return group;
  },
};
