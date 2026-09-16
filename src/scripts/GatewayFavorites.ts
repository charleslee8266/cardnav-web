/**
 * 文件说明: 保存中转站本地收藏，并同步列表内收藏按钮与排序状态。
 */
export class GatewayFavorites {
  private readonly storageKey = 'cardnav.favoriteGateways';
  private keys = new Set<string>();

  constructor(root: HTMLElement, private readonly labels: { favorite: string; unfavorite: string }, private readonly onChange: () => void) {
    try {
      const saved = JSON.parse(localStorage.getItem(this.storageKey) || '[]');
      if (Array.isArray(saved)) this.keys = new Set(saved.filter(key => typeof key === 'string'));
    } catch { /* 存储不可用时仍可在当前页面收藏。 */ }
    root.addEventListener('click', event => {
      const button = (event.target as Element).closest<HTMLButtonElement>('[data-gateway-favorite]');
      if (!button) return;
      const key = button.dataset.gatewayFavorite!;
      if (this.keys.has(key)) this.keys.delete(key);
      else this.keys.add(key);
      try { localStorage.setItem(this.storageKey, JSON.stringify([...this.keys])); } catch { /* 保留当前页面的收藏。 */ }
      this.sync(root);
      this.onChange();
    });
    this.sync(root);
  }

  get hasFavorites() { return this.keys.size > 0; }
  has(key: string) { return this.keys.has(key); }

  create(key: string, name: string) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'favorite-toggle';
    button.dataset.gatewayFavorite = key;
    button.dataset.siteName = name;
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    button.append(icon);
    this.update(button);
    return button;
  }

  sync(container: ParentNode) {
    container.querySelectorAll<HTMLButtonElement>('[data-gateway-favorite]').forEach(button => this.update(button));
  }

  private update(button: HTMLButtonElement) {
    const favorite = this.has(button.dataset.gatewayFavorite!);
    const label = favorite ? this.labels.unfavorite : this.labels.favorite;
    button.setAttribute('aria-pressed', String(favorite));
    button.setAttribute('aria-label', `${label} ${button.dataset.siteName || ''}`);
    button.title = label;
    button.querySelector('span')!.textContent = favorite ? '♥' : '♡';
    button.closest<HTMLElement>('tr')?.setAttribute('data-sort-favorite', favorite ? '1' : '0');
  }
}
