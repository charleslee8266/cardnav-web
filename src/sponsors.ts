/**
 * 文件说明: 读取赞助商 JSON 配置，并按当前语言输出可渲染的赞助商数据。
 */
import sponsorsData from './data/sponsors.json' with { type: 'json' };
import { defaultLocale, type Locale } from './i18n/config.js';

export type SponsorTemplate = 'default' | 'grid';
export type SponsorImageScaleMode = 'contain' | 'cover' | 'inset';

type LocalizedValue<T> = Partial<Record<Locale, T>> & { default?: T };

type SponsorImageConfig = {
  src: string;
  scaleMode: SponsorImageScaleMode;
  padding?: string;
  backgroundColor?: string;
  alt: LocalizedValue<string>;
};

type SponsorLinkConfig = {
  color?: string;
  text: LocalizedValue<string>;
  url: LocalizedValue<string>;
};

type SponsorConfig = {
  id: string;
  visible: boolean;
  template: SponsorTemplate;
  image: SponsorImageConfig;
  title: LocalizedValue<string>;
  description: LocalizedValue<string>;
  url: LocalizedValue<string>;
  links?: SponsorLinkConfig[];
};

export type SponsorLink = {
  text: string;
  url: string;
  color?: string;
};

export type Sponsor = {
  id: string;
  template: SponsorTemplate;
  title: string;
  description: string;
  url: string;
  image: Omit<SponsorImageConfig, 'alt'> & { alt: string };
  links: SponsorLink[];
};

const sponsorConfigs = sponsorsData as SponsorConfig[];

function localize<T>(values: LocalizedValue<T>, locale: Locale): T {
  const value = values[locale] ?? values.default ?? values[defaultLocale];
  if (value === undefined) throw new Error(`Missing localized sponsor value for ${locale}`);
  return value;
}

export function getVisibleSponsors(locale: Locale): Sponsor[] {
  return sponsorConfigs
    .filter(sponsor => sponsor.visible)
    .map(sponsor => {
      return {
        id: sponsor.id,
        template: sponsor.template,
        title: localize(sponsor.title, locale),
        description: localize(sponsor.description, locale),
        url: localize(sponsor.url, locale),
        image: {
          src: sponsor.image.src,
          scaleMode: sponsor.image.scaleMode,
          padding: sponsor.image.padding,
          backgroundColor: sponsor.image.backgroundColor,
          alt: localize(sponsor.image.alt, locale),
        },
        links: (sponsor.links ?? []).map(link => ({
          text: localize(link.text, locale),
          url: localize(link.url, locale),
          color: link.color,
        })),
      };
    });
}
