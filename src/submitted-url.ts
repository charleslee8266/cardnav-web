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

const temporaryUrlPattern = /^https?:\/\/(?:[^/?#]+\.)*(?:webhook\.site|serveousercontent\.com|lhr\.life|loca\.lt|nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me|vcap\.me|traefik\.me)(?::\d+)?(?:[/?#]|$)/i;
const wzypAliasHostPattern = /^(?:[a-z0-9-]+\.)*(?:ldxp|wzyp)\.cn\.?$/i;
const wzypSubmittedHostSource = 'wzyp\\.cn';
const productItemUrlPattern = new RegExp(`^https?://(?:${wzypSubmittedHostSource}|catfk\\.com)(?::\\d+)?/(?:item/[^/?#]+|shop/[^/?#]+/[^?#]+)`, 'i');
const trackedShopUrlPattern = new RegExp(`^https?://(?:${wzypSubmittedHostSource}|catfk\\.com)(?::\\d+)?/shop/[^/?#]+/?(?:[?#]|$)`, 'i');
const ipAddressUrlPattern = /^https?:\/\/(?:\d{1,3}(?:\.\d{1,3}){3}|\[[0-9a-f:.]+\])(?::\d+)?(?:[/?#]|$)/i;
const incompleteDomainUrlPattern = /^https?:\/\/[^/?#.[\]:]+(?::\d+)?(?:[/?#]|$)/i;
const platformHomeUrlPattern = new RegExp(`^https?://(?:${wzypSubmittedHostSource}|catfk\\.com)(?::\\d+)?/?(?:[?#]|$)`, 'i');
const reservedHostnamePattern = /(?:^|\.)(?:example\.(?:com|net|org)|example|test|localhost|local|internal|invalid)$/i;
const probeHostnamePattern = /(?:^|\.)(?:oast\.(?:online|live|site|fun|pro|me)|interact\.sh|burpcollaborator\.net|canarytokens\.com|httpbin\.org)$/i;
const controlCharacterPattern = /[\u0000-\u001f\u007f]/;
const dnsLabelPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;
// Match executable probe syntax, not ordinary apostrophes or words in storefront paths.
const injectionProbePattern = /\b(?:sleep|pg_sleep|benchmark)\s*\(\s*\d|\bunion\s+(?:all\s+)?select\b|['"]\s*(?:or|and|xor)\s*(?:\(|['"]?\d+['"]?\s*=)|['"]\d+['"]\s*=\s*['"]\d|\b(?:or|and|xor)\s*\(?\s*\d+\s*=\s*\d+|<\s*\$?script\b|<\s*\$?(?:svg|img|iframe)\b[^>]*\bon\w+\s*=/i;
const probeUrlPattern = /^https?:\/\/(?:(?:www\.)?google\.com(?::\d+)?\/url(?:[/?#]|$)|(?:(?:www|staging)\.)?cardnav\.xyz(?::\d+)?\/(?:admin|api)(?:[/?#]|$))/i;

export type PublicSubmittedUrlChange = {
  kind: 'trim' | 'format' | 'alias' | 'protocol' | 'port' | 'query' | 'fragment' | 'trailingSlash';
  from?: string;
  to?: string;
};

export function validatePublicSubmittedUrl(input: string, changes?: PublicSubmittedUrlChange[]): PublicSubmittedUrlValidationResult {
  if (controlCharacterPattern.test(input.trim())) return { ok: false, reason: 'probeUrl' };
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return { ok: false, reason: 'invalidUrl' };
  }

  if (url.username || url.password) return { ok: false, reason: 'invalidUrl' };

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'invalidUrl' };
  }

  const hostname = url.hostname.replace(/\.$/, '');
  if (!url.hostname.startsWith('[') && (hostname.length > 253 || hostname.split('.').some(label => !dnsLabelPattern.test(label)))) {
    return { ok: false, reason: 'invalidDomainUrl', url: url.toString().replace(/\/$/, '') };
  }
  url.hostname = hostname;
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
  if (platformHomeUrlPattern.test(normalized) || (/^(?:(?:www\.)?google\.com|docs\.qq\.com|(?:www\.)?(?:t\.co|bit\.ly))$/i.test(url.hostname) && url.pathname === '/')) return { ok: false, reason: 'platformHomeUrl', url: normalized };
  if (reservedHostnamePattern.test(url.hostname)) return { ok: false, reason: 'reservedHostUrl', url: normalized };
  if (probeHostnamePattern.test(url.hostname) || probeUrlPattern.test(normalized) || hasInjectionProbe(url.pathname + url.search)) return { ok: false, reason: 'probeUrl', url: normalized };

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

function hasInjectionProbe(value: string) {
  // Inspect raw and encoded probes without changing the submitted path or query.
  for (let pass = 0; pass < 3; pass++) {
    if (controlCharacterPattern.test(value)) return true;
    // SQL comments separate tokens just like whitespace, including URL-encoded comments.
    const syntax = value.replace(/\+/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
    if (injectionProbePattern.test(syntax)) return true;
    const decoded = value.replace(/(?:%[0-9a-f]{2})+/gi, encoded => {
      try { return decodeURIComponent(encoded); } catch { return encoded; }
    });
    if (decoded === value) break;
    value = decoded;
  }
  return false;
}
