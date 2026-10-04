/** Product brand marks shared by subscriptions, shops and model-family labels. */
const marks: Record<string, { icon: string; monochrome: boolean }> = {
  'gpt': { icon: 'gpt', monochrome: true },
  'claude': { icon: 'claude', monochrome: false },
  'gemini': { icon: 'gemini', monochrome: false },
  'grok': { icon: 'grok', monochrome: true },
  'x': { icon: '', monochrome: false },
  'cursor': { icon: 'cursor', monochrome: true },
  'muse': { icon: 'muse', monochrome: false },
  'copilot': { icon: 'copilot.png', monochrome: false },
  'gmail': { icon: 'gmail', monochrome: false },
  'outlook': { icon: 'outlook.png', monochrome: false },
  'icloud': { icon: 'icloud.png', monochrome: false },
  'apple-id': { icon: '', monochrome: false },
  'api-gateway': { icon: 'api-gateway', monochrome: false },
  'kyc': { icon: 'kyc', monochrome: false },
  'phone-verification': { icon: 'phone-verification', monochrome: false },
  'vcc': { icon: 'vcc', monochrome: false },
  'paypal': { icon: 'paypal', monochrome: false },
  'telegram': { icon: 'telegram', monochrome: false },
  'tiktok': { icon: 'tiktok', monochrome: true },
};
export function productMark(id: string) { return marks[id]; }
export function productIconPath(icon: string) {
  return icon.startsWith('/') ? icon : `/assets/product-icons/${icon.includes('.') ? icon : `${icon}.svg`}`;
}
export function productFamilyMark(id: string) {
  const mark = marks[id];
  return { path: productIconPath(mark.icon), monochrome: mark.monochrome };
}
