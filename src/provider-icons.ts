/** Official brand assets; provenance lives beside the assets in sources.json. */
const providerIcons: Record<string, string> = {
  alibaba: 'alibaba.png',
  'black forest labs': 'black-forest-labs.svg',
  bytedance: 'bytedance.png',
  deepseek: 'deepseek.ico',
  jina: 'jina.png',
  meta: 'meta.png',
  midjourney: 'midjourney.png',
  minimax: 'minimax.ico',
  mistral: 'mistral.png',
  moonshot: 'moonshot.ico',
  'stability ai': 'stability-ai.webp',
  suno: 'suno.jpg',
  'z.ai': 'z-ai.svg',
};

export function getProviderIcon(provider: unknown): string | undefined {
  if (typeof provider !== 'string') return undefined;
  const asset = providerIcons[provider.trim().toLowerCase()];
  return asset ? `/assets/provider-icons/${asset}` : undefined;
}
