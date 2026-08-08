/**
 * 文件说明: 读取赞助商 JSON 配置，并按当前语言输出可渲染的赞助商数据。
 */
import sponsorsData from './data/sponsors.json' with { type: 'json' };
import { defaultLocale, type Locale } from './i18n/config.js';

export type SponsorTemplate = 'default' | 'grid';

type LocalizedValue<T> = Record<Locale, T>;

type SponsorContent = {
  title: string;
  description: string;
  url: string;
};

type SponsorLinkContent = {
  text: string;
  url: string;
};

type SponsorImageConfig = {
  src: string;
  width: number;
  height: number;
  frameClass?: string;
  className?: string;
  alt: LocalizedValue<string>;
};

type SponsorLinkConfig = {
  color?: string;
  content: LocalizedValue<SponsorLinkContent>;
};

type SponsorConfig = {
  id: string;
  visible: boolean;
  template: SponsorTemplate;
  image: SponsorImageConfig;
  content: LocalizedValue<SponsorContent>;
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
  return values[locale] ?? values[defaultLocale];
}

export function getVisibleSponsors(locale: Locale): Sponsor[] {
  return sponsorConfigs
    .filter(sponsor => sponsor.visible)
    .map(sponsor => {
      const content = localize(sponsor.content, locale);
      return {
        id: sponsor.id,
        template: sponsor.template,
        title: content.title,
        description: content.description,
        url: content.url,
        image: {
          src: sponsor.image.src,
          width: sponsor.image.width,
          height: sponsor.image.height,
          frameClass: sponsor.image.frameClass,
          className: sponsor.image.className,
          alt: localize(sponsor.image.alt, locale),
        },
        links: (sponsor.links ?? []).map(link => ({
          ...localize(link.content, locale),
          color: link.color,
        })),
      };
    });
}
