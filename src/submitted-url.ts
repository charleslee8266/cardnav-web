/**
 * 文件说明: 定义商家提交 URL 的规范化、拒绝原因和公开提交前校验。
 */

export type PublicSubmittedUrlRejectReason = 'invalidUrl' | 'temporaryUrl' | 'productItemUrl' | 'ipAddressUrl' | 'invalidDomainUrl';

export type PublicSubmittedUrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: PublicSubmittedUrlRejectReason; url?: string };

const temporaryUrlPattern = /^https?:\/\/(?:[^/?#]+\.)?(?:webhook\.site|serveousercontent\.com)(?::\d+)?(?:[/?#]|$)/i;
const productItemUrlPattern = /^https?:\/\/(?:pay\.ldxp\.cn|catfk\.com)(?::\d+)?\/(?:item\/[^/?#]+|shop\/[^/?#]+\/[^?#]+)/i;
const trackedShopUrlPattern = /^https?:\/\/(?:pay\.ldxp\.cn|catfk\.com)(?::\d+)?\/shop\/[^/?#]+(?:[?#]|$)/i;
const ipAddressUrlPattern = /^https?:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;
const incompleteDomainUrlPattern = /^https?:\/\/[^/?#.[\]:]+(?::\d+)?(?:[/?#]|$)/i;

export function validatePublicSubmittedUrl(input: string): PublicSubmittedUrlValidationResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'invalidUrl' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalidUrl' };
  }

  url.hash = '';
  const normalized = normalizeParsedPublicSubmittedUrl(url);
  if (ipAddressUrlPattern.test(normalized)) return { ok: false, reason: 'ipAddressUrl', url: normalized };
  if (incompleteDomainUrlPattern.test(normalized)) return { ok: false, reason: 'invalidDomainUrl', url: normalized };
  if (temporaryUrlPattern.test(normalized)) return { ok: false, reason: 'temporaryUrl', url: normalized };
  if (productItemUrlPattern.test(normalized)) return { ok: false, reason: 'productItemUrl', url: normalized };

  if (trackedShopUrlPattern.test(normalized)) url.search = '';
  return { ok: true, url: normalizeParsedPublicSubmittedUrl(url) };
}

function normalizeParsedPublicSubmittedUrl(url: URL) {
  return url.toString().replace(/\/$/, '');
}
