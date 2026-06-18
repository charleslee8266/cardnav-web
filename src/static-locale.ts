/**
 * 文件说明: 为 Astro 静态预渲染页面补齐多语言 locals，复用运行时 middleware 的语言上下文规则。
 */
import type { AstroGlobal } from 'astro';
import { defaultLocale, type Locale } from './i18n/config.js';
import { getMessages } from './i18n/messages.js';
import { localizePath } from './i18n/paths.js';

export function applyStaticLocaleLocals(
  astro: AstroGlobal,
  locale: Locale = defaultLocale,
  originalPathname: string,
) {
  const hasLocalePrefix = locale !== defaultLocale || originalPathname.startsWith(`/${locale}/`) || originalPathname === `/${locale}`;
  astro.locals.locale = locale;
  astro.locals.routePathname = originalPathname;
  astro.locals.originalPathname = originalPathname;
  astro.locals.hasLocalePrefix = hasLocalePrefix;
  astro.locals.messages = getMessages(locale);
  astro.locals.localizePath = (pathname: string) =>
    localizePath(pathname, locale, {
      prefixDefaultLocale: hasLocalePrefix && locale === defaultLocale,
    });
}
