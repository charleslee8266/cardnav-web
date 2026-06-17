/**
 * 文件说明: 维护多语言 URL 解析、生成和语言切换路径规则。
 */
import { defaultLocale, isLocale, type Locale } from './config.js';

export type LocalePathInfo = {
  locale: Locale;
  pathname: string;
  routePathname: string;
  hasLocalePrefix: boolean;
};

function normalizePathname(pathname: string) {
  const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

export function getLocalePathInfo(pathnameInput: string): LocalePathInfo {
  const pathname = normalizePathname(pathnameInput);
  const [, maybeLocale, ...restSegments] = pathname.split('/');
  if (maybeLocale && isLocale(maybeLocale)) {
    const routePathname = normalizePathname(`/${restSegments.join('/')}`);
    return {
      locale: maybeLocale,
      pathname,
      routePathname,
      hasLocalePrefix: true,
    };
  }

  return {
    locale: defaultLocale,
    pathname,
    routePathname: pathname,
    hasLocalePrefix: false,
  };
}

export function localizePath(
  pathnameInput: string,
  locale: Locale = defaultLocale,
  options: { prefixDefaultLocale?: boolean } = {},
) {
  const pathname = normalizePathname(pathnameInput);
  if (/^\/(?:api|assets)(?:\/|$)/.test(pathname)) return pathname;
  if (pathname.includes('.') && !pathname.startsWith('/guide/')) return pathname;
  const routePathname = getLocalePathInfo(pathname).routePathname;
  if (locale === defaultLocale && !options.prefixDefaultLocale) return routePathname;
  return routePathname === '/' ? `/${locale}` : `/${locale}${routePathname}`;
}

export function canonicalPath(pathnameInput: string, locale: Locale = defaultLocale) {
  return localizePath(getLocalePathInfo(pathnameInput).routePathname, locale);
}

export function switchLocalePath(pathnameInput: string, nextLocale: Locale) {
  return localizePath(getLocalePathInfo(pathnameInput).routePathname, nextLocale);
}
