/*
文件说明: 定义公开商家平台、平台标签与自建商家商品访问确认规则。
*/
export const shopPlatforms = [
  { id: 'ldxp', name: '链动小铺', families: ['platform-ldxp', 'platform-wzyp'], icon: '/assets/shop-platform-icons/ldxp.ico' },
  { id: '16688', name: '16688', families: ['platform-16688'], icon: '/assets/shop-platform-icons/16688.png' },
  { id: 'catfk', name: '云猫寄售', families: ['platform-catfk'], icon: '/assets/shop-platform-icons/catfk.jpg' },
] as const;

export function requiresProductRiskConfirmation(site: { platformName?: string }): boolean {
  return !site.platformName;
}

export function shopPlatformName(family: unknown): string {
  return shopPlatforms.find(platform => (platform.families as readonly string[]).includes(String(family)))?.name || '';
}

export function shopPlatformIcon(name: string): string {
  if (!name) return '/assets/shop-platform-icons/self-hosted.svg';
  return shopPlatforms.find(platform => platform.name === name)?.icon || '';
}

/** Preserve links saved before the public CatFK label was corrected. */
export function shopPlatformFromUrl(value: string): string {
  return value === 'CatFK' ? '云猫寄售' : value;
}

export function createShopPlatformLabel(name: string, selfHostedLabel: string) {
  const label = document.createElement('span'); label.className = 'shop-platform-label';
  const icon = shopPlatformIcon(name);
  if (icon) {
    const image = document.createElement('img'); image.src = icon; image.alt = ''; image.width = 16; image.height = 16;
    label.append(image);
  }
  const text = document.createElement('span'); text.className = 'shop-platform-label-text'; text.textContent = name || selfHostedLabel;
  label.append(text);
  return label;
}
