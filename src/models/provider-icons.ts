/** Official brand assets; provenance lives beside the assets in sources.json. */
const providerIcons: Record<string, { file: string; monochrome: boolean }> = {
  'OpenAI': { file: 'openai.svg', monochrome: true },
  'Anthropic': { file: 'anthropic.svg', monochrome: true },
  'Google': { file: 'google.svg', monochrome: false },
  'xAI': { file: 'spacexai.svg', monochrome: true },
  'Tencent': { file: 'tencent.svg', monochrome: false },
  'Xiaomi': { file: 'xiaomi.svg', monochrome: true },
  'StepFun': { file: 'stepfun.svg', monochrome: true },
  'Thinking Machines Lab': { file: 'thinky.svg', monochrome: true },
  'Upstage': { file: 'upstage.svg', monochrome: false },
  'Poolside': { file: 'poolside.svg', monochrome: false },
  'IBM': { file: 'ibm.svg', monochrome: false },
  'Inception AI': { file: 'inception-ai.svg', monochrome: true },
  'Baidu': { file: 'baidu.svg', monochrome: false },
  'Meituan': { file: 'meituan.svg', monochrome: false },
  'NVIDIA': { file: 'nvidia.svg', monochrome: false },
  'Amazon': { file: 'amazon.svg', monochrome: false },
  'Cohere': { file: 'cohere.svg', monochrome: false },
  'AI2': { file: 'ai2.svg', monochrome: true },
  'Ant Group': { file: 'ant-group.svg', monochrome: true },
  'Microsoft': { file: 'microsoft.svg', monochrome: false },
  'Microsoft AI': { file: 'microsoft-ai.svg', monochrome: false },
  'Reve': { file: 'reve.svg', monochrome: true },
  'Ideogram': { file: 'ideogram.svg', monochrome: true },
  'Luma': { file: 'luma-ai.svg', monochrome: true },
  'Recraft': { file: 'recraft.svg', monochrome: true },
  'Krea': { file: 'krea.svg', monochrome: true },
  'HiDream': { file: 'hidream.svg', monochrome: false },
  'Runway': { file: 'runway.svg', monochrome: true },
  'Leonardo AI': { file: 'leonardo-ai.svg', monochrome: true },
  'Alibaba': { file: 'alibaba.png', monochrome: false },
  'Black Forest Labs': { file: 'black-forest-labs.svg', monochrome: false },
  'ByteDance': { file: 'bytedance.png', monochrome: false },
  'DeepSeek': { file: 'deepseek.ico', monochrome: false },
  'Jina': { file: 'jina.png', monochrome: false },
  'Meta': { file: 'meta.png', monochrome: false },
  'Midjourney': { file: 'midjourney.png', monochrome: false },
  'MiniMax': { file: 'minimax.ico', monochrome: false },
  'Mistral': { file: 'mistral.png', monochrome: false },
  'Moonshot': { file: 'moonshot.ico', monochrome: false },
  'Stability AI': { file: 'stability-ai.webp', monochrome: false },
  'Suno': { file: 'suno.jpg', monochrome: false },
  'Z.ai': { file: 'z-ai.svg', monochrome: false },
};

export function getProviderIcon(provider: unknown): string | undefined {
  if (typeof provider !== 'string') return undefined;
  const asset = providerIcons[provider];
  return asset ? `/assets/provider-icons/${asset.file}` : undefined;
}

export function isMonochromeProviderIcon(provider: string): boolean {
  return providerIcons[provider]?.monochrome ?? false;
}
