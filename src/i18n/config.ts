/**
 * 文件说明: 定义 CardNav 公开站点支持的语言、默认语言和语言展示信息。
 */

export const supportedLocales = ['zh', 'en', 'ru'] as const;
export type Locale = (typeof supportedLocales)[number];

export const defaultLocale: Locale = 'zh';

export const localeLabels: Record<Locale, { label: string; nativeLabel: string; flag: string; htmlLang: string }> = {
  zh: {
    label: '简体中文',
    nativeLabel: '简体中文',
    flag: '🇨🇳',
    htmlLang: 'zh-CN',
  },
  en: {
    label: 'English',
    nativeLabel: 'English',
    flag: '🇺🇸',
    htmlLang: 'en',
  },
  ru: {
    label: 'Русский',
    nativeLabel: 'Русский',
    flag: '🇷🇺',
    htmlLang: 'ru',
  },
};

export function isLocale(input: string): input is Locale {
  return supportedLocales.includes(input as Locale);
}

export function getLocaleHtmlLang(locale: Locale) {
  return localeLabels[locale].htmlLang;
}
