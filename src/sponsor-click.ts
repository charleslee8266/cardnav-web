/**
 * 文件说明: 定义合作商家点击契约并校验匿名身份、展示位置及最小跳转上下文。
 */
import { pageTypes, type PageType } from './page-types.js';
import type { SponsorPlacement } from './sponsor-provider.js';
export type SponsorClickEvent = {
  eventId: string; occurredAt: string; visitorId: string; sponsorId: string;
  placement: SponsorPlacement; sourcePage: string; pageType: PageType;
  targetUrl: string; linkKind: 'main' | 'extra';
};
const uuidPattern = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
export function sponsorClickTarget(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
}
export function parseSponsorClick(input: Record<string, unknown>): SponsorClickEvent | null {
  if (typeof input.eventId !== 'string' || !uuidPattern.test(input.eventId)
    || typeof input.visitorId !== 'string' || !uuidPattern.test(input.visitorId)
    || typeof input.sponsorId !== 'string' || !input.sponsorId.trim() || input.sponsorId.length > 200
    || typeof input.occurredAt !== 'string' || !Number.isFinite(Date.parse(input.occurredAt))
    || Math.abs(Date.now() - Date.parse(input.occurredAt)) > 24 * 60 * 60_000
    || !['after-hero', 'page-bottom', 'content-bottom'].includes(String(input.placement))
    || !pageTypes.includes(input.pageType as PageType)
    || typeof input.sourcePage !== 'string' || input.sourcePage.length > 500
    || !input.sourcePage.startsWith('/') || input.sourcePage.startsWith('//') || /[?#\\\s]/.test(input.sourcePage)
    || !['main', 'extra'].includes(String(input.linkKind))) return null;
  const targetUrl = sponsorClickTarget(input.targetUrl);
  if (!targetUrl) return null;
  return {
    eventId: input.eventId, occurredAt: new Date(input.occurredAt).toISOString(), visitorId: input.visitorId,
    sponsorId: input.sponsorId, placement: input.placement as SponsorPlacement,
    sourcePage: input.sourcePage, pageType: input.pageType as PageType,
    targetUrl, linkKind: input.linkKind as SponsorClickEvent['linkKind'],
  };
}
