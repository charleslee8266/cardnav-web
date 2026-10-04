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
      const info = document.createElement('button');
      info.type = 'button';
      info.className = 'merchant-badge-info';
      info.setAttribute('aria-haspopup', 'dialog');
      info.setAttribute('aria-label', description);
      info.textContent = 'i';
      const tooltip = document.createElement('span');
      tooltip.className = 'merchant-badge-tooltip public-floating-layer';
      tooltip.id = `merchant-disclosure-${crypto.randomUUID()}`;
      tooltip.setAttribute('popover', 'auto');
      tooltip.setAttribute('role', 'dialog');
      tooltip.setAttribute('aria-label', label);
      info.setAttribute('popovertarget', tooltip.id);
      tooltip.append(document.createTextNode(`${description} `));
      const link = document.createElement('a');
      link.className = 'merchant-badge-link';
      link.href = href;
      link.textContent = linkLabel;
      link.dataset.umamiEvent = 'internal-link-click';
      link.dataset.umamiEventLinkType = kind === 'support' ? 'support-list' : 'sponsor-lead';
      link.dataset.umamiEventUrl = href;
      if (href) tooltip.append(link, document.createTextNode(document.documentElement.lang.startsWith('zh') ? '。' : '.'));
      badge.append(info, tooltip);
    }
    return group;
  },
};

// Native popovers stay outside scroll containers and occupy no space while closed.
function positionDisclosure(tooltip) {
  const trigger = document.querySelector(`[popovertarget="${tooltip.id}"]`);
  if (!trigger || !tooltip.matches(':popover-open')) return;
  const edge = 16;
  const anchor = trigger.getBoundingClientRect();
  const bounds = tooltip.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  tooltip.style.left = `${Math.max(edge, Math.min(anchor.left, viewportWidth - bounds.width - edge))}px`;
  const below = anchor.bottom + 8;
  tooltip.style.top = `${Math.max(edge, Math.min(below, viewportHeight - bounds.height - edge))}px`;
}
document.addEventListener('toggle', event => {
  if (event.target.matches?.('.merchant-badge-tooltip') && event.newState === 'open') positionDisclosure(event.target);
}, true);
function repositionOpenDisclosures() {
  document.querySelectorAll('.merchant-badge-tooltip:popover-open').forEach(positionDisclosure);
}
window.addEventListener('resize', repositionOpenDisclosures);
window.addEventListener('scroll', repositionOpenDisclosures, true);

let disclosureHideTimer;
function disclosureForTrigger(trigger) {
  return trigger ? document.getElementById(trigger.getAttribute('popovertarget')) : null;
}
function showDisclosure(trigger) {
  const tooltip = disclosureForTrigger(trigger);
  if (!tooltip) return;
  clearTimeout(disclosureHideTimer);
  if (!tooltip.matches(':popover-open')) tooltip.showPopover();
  positionDisclosure(tooltip);
}
document.addEventListener('pointerover', event => {
  if (event.pointerType !== 'mouse') return;
  const trigger = event.target.closest?.('.merchant-badge-info[popovertarget]');
  if (trigger) showDisclosure(trigger);
  if (event.target.closest?.('.merchant-badge-tooltip')) clearTimeout(disclosureHideTimer);
});
document.addEventListener('pointerout', event => {
  if (event.pointerType !== 'mouse' || !event.target.closest?.('.merchant-badge-info, .merchant-badge-tooltip')) return;
  if (event.relatedTarget?.closest?.('.merchant-badge-info, .merchant-badge-tooltip')) return;
  disclosureHideTimer = setTimeout(() => {
    document.querySelectorAll('.merchant-badge-tooltip:popover-open').forEach(tooltip => {
      const trigger = document.querySelector(`[popovertarget="${tooltip.id}"]`);
      if (!tooltip.contains(document.activeElement) && document.activeElement !== trigger) tooltip.hidePopover();
    });
  }, 180);
});
document.addEventListener('click', event => {
  const trigger = event.target.closest?.('.merchant-badge-info[popovertarget]');
  if (!trigger) return;
  event.stopPropagation();
  if (disclosureForTrigger(trigger)?.matches(':popover-open')) event.preventDefault();
}, true);
