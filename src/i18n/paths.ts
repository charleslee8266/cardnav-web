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

function splitPathSuffix(pathnameInput: string) {
  const suffixIndex = pathnameInput.search(/[?#]/);
  if (suffixIndex < 0) return { pathname: pathnameInput, suffix: '' };
  return {
    pathname: pathnameInput.slice(0, suffixIndex),
    suffix: pathnameInput.slice(suffixIndex),
  };
}

function normalizePathname(pathname: string) {
  const { pathname: rawPathname, suffix } = splitPathSuffix(pathname);
  const normalized = rawPathname.startsWith('/') ? rawPathname : `/${rawPathname}`;
  const normalizedPathname = normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
  return `${normalizedPathname}${suffix}`;
}

export function getLocalePathInfo(pathnameInput: string): LocalePathInfo {
  const pathname = normalizePathname(pathnameInput);
  const { pathname: pathnameWithoutSuffix, suffix } = splitPathSuffix(pathname);
  const [, maybeLocale, ...restSegments] = pathnameWithoutSuffix.split('/');
  if (maybeLocale && isLocale(maybeLocale)) {
    const routePathname = normalizePathname(`/${restSegments.join('/')}${suffix}`);
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
  const { pathname: pathnameWithoutSuffix, suffix } = splitPathSuffix(pathname);
  if (/^\/(?:api|assets)(?:\/|$)/.test(pathnameWithoutSuffix)) return pathname;
  if (pathnameWithoutSuffix.includes('.') && !pathnameWithoutSuffix.startsWith('/guide/')) return pathname;
  const routePathname = getLocalePathInfo(pathname).routePathname;
  const { pathname: routePathnameWithoutSuffix } = splitPathSuffix(routePathname);
  if (locale === defaultLocale && !options.prefixDefaultLocale) return routePathname;
  return routePathnameWithoutSuffix === '/' ? `/${locale}${suffix}` : `/${locale}${routePathname}`;
}

export function canonicalPath(pathnameInput: string, locale: Locale = defaultLocale) {
  return localizePath(getLocalePathInfo(pathnameInput).routePathname, locale);
}

export function switchLocalePath(pathnameInput: string, nextLocale: Locale) {
  return localizePath(getLocalePathInfo(pathnameInput).routePathname, nextLocale);
}
