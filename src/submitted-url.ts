/**
 * 文件说明: 定义商家提交 URL 的规范化、拒绝原因和公开提交前校验。
 */

export type PublicSubmittedUrlRejectReason =
  | 'invalidUrl'
  | 'temporaryUrl'
  | 'productItemUrl'
  | 'ipAddressUrl'
  | 'invalidDomainUrl'
  | 'platformHomeUrl'
  | 'reservedHostUrl'
  | 'probeUrl';

export type PublicSubmittedUrlValidationResult =
  | { ok: true; url: string }
  | { ok: false; reason: PublicSubmittedUrlRejectReason; url?: string };

const temporaryUrlPattern = /^https?:\/\/(?:[^/?#]+\.)*(?:webhook\.site|serveousercontent\.com|lhr\.life|loca\.lt)(?::\d+)?(?:[/?#]|$)/i;
const wzypAliasHostPattern = /^(?:[a-z0-9-]+\.)*(?:ldxp|wzyp)\.cn\.?$/i;
const wzypSubmittedHostSource = 'wzyp\\.cn';
const productItemUrlPattern = new RegExp(`^https?://(?:${wzypSubmittedHostSource}|catfk\\.com)(?::\\d+)?/(?:item/[^/?#]+|shop/[^/?#]+/[^?#]+)`, 'i');
const trackedShopUrlPattern = new RegExp(`^https?://(?:${wzypSubmittedHostSource}|catfk\\.com)(?::\\d+)?/shop/[^/?#]+/?(?:[?#]|$)`, 'i');
const ipAddressUrlPattern = /^https?:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;
const incompleteDomainUrlPattern = /^https?:\/\/[^/?#.[\]:]+(?::\d+)?(?:[/?#]|$)/i;
const platformHomeUrlPattern = new RegExp(`^https?://(?:${wzypSubmittedHostSource}|catfk\\.com)(?::\\d+)?/?(?:[?#]|$)`, 'i');
const reservedHostUrlPattern = /^https?:\/\/(?:localhost|[^/?#]+\.(?:local|internal|invalid))(?::\d+)?(?:[/?#]|$)/i;
const probeUrlPattern = /^https?:\/\/(?:(?:[^/?#:]+\.)?example\.[^/?#:]+(?::\d+)?\/[^?#]*(?:ctf|probe|admin|test|'|%27|%20or%20|--)|httpbin\.org(?::\d+)?\/base64\/|(?:(?:www|staging)\.)?cardnav\.xyz(?::\d+)?\/(?:admin|api)(?:[/?#]|$))/i;

export type PublicSubmittedUrlChange = {
  kind: 'trim' | 'format' | 'alias' | 'protocol' | 'port' | 'query' | 'fragment' | 'trailingSlash';
  from?: string;
  to?: string;
};

export function validatePublicSubmittedUrl(input: string, changes?: PublicSubmittedUrlChange[]): PublicSubmittedUrlValidationResult {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'invalidUrl' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalidUrl' };
  }

  if (input !== input.trim()) changes?.push({ kind: 'trim' });
  // URL parsing can canonicalize host casing, default ports, escaping and dot segments.
  if (url.href.replace(/\/$/, '') !== input.trim().replace(/\/$/, '')) changes?.push({ kind: 'format' });
  if (url.href.includes('#')) changes?.push({ kind: 'fragment' });
  url.hash = '';
  const normalized = normalizeParsedPublicSubmittedUrl(url, changes);
  if (ipAddressUrlPattern.test(normalized)) return { ok: false, reason: 'ipAddressUrl', url: normalized };
  if (incompleteDomainUrlPattern.test(normalized)) return { ok: false, reason: 'invalidDomainUrl', url: normalized };
  if (temporaryUrlPattern.test(normalized)) return { ok: false, reason: 'temporaryUrl', url: normalized };
  if (productItemUrlPattern.test(normalized)) return { ok: false, reason: 'productItemUrl', url: normalized };
  if (platformHomeUrlPattern.test(normalized)) return { ok: false, reason: 'platformHomeUrl', url: normalized };
  if (reservedHostUrlPattern.test(normalized)) return { ok: false, reason: 'reservedHostUrl', url: normalized };
  if (probeUrlPattern.test(normalized)) return { ok: false, reason: 'probeUrl', url: normalized };

  if (trackedShopUrlPattern.test(normalized)) {
    if (url.href.includes('?')) changes?.push({ kind: 'query' });
    url.search = '';
  }
  const canonical = normalizeParsedPublicSubmittedUrl(url);
  if (url.href.endsWith('/') && input.trim().split(/[?#]/, 1)[0]!.endsWith('/')) changes?.push({ kind: 'trailingSlash' });
  return { ok: true, url: canonical };
}

function normalizeParsedPublicSubmittedUrl(url: URL, changes?: PublicSubmittedUrlChange[]) {
  if (wzypAliasHostPattern.test(url.hostname)) {
    if (url.hostname !== 'wzyp.cn') changes?.push({ kind: 'alias', from: url.hostname, to: 'wzyp.cn' });
    if (url.protocol !== 'https:') changes?.push({ kind: 'protocol', from: url.protocol.slice(0, -1), to: 'https' });
    if (url.port) changes?.push({ kind: 'port', from: url.port });
    url.hostname = 'wzyp.cn';
    url.protocol = 'https:';
    url.port = '';
  }
  return url.toString().replace(/\/$/, '');
}
