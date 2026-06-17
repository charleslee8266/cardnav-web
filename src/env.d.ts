/// <reference types="astro/client" />

import type { Locale } from './i18n/config';
import type { Messages } from './i18n/zh';

declare global {
  namespace App {
    interface Locals {
      locale: Locale;
      routePathname: string;
      originalPathname: string;
      hasLocalePrefix: boolean;
      messages: Messages;
      localizePath: (pathname: string) => string;
    }
  }
}

declare module '*?raw' {
  const content: string;
  export default content;
}
