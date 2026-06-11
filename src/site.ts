/**
 * 文件说明: 维护 CardNav 公开站点运行时常量，供 Astro 页面、布局和 API 复用。
 */
import 'dotenv/config';

export const publicSiteUrl = process.env.SITE_URL || 'https://cardnav.xyz';
export const telegramGroupUrl = 'https://t.me/cardnav_xyz_group';
export const githubRepoUrl = 'https://github.com/charleslee8266/cardnav-web';

export const headerAdTagEnabled = ['1', 'true', 'yes', 'on'].includes(
  String(process.env.HEADER_AD_TAG_ENABLED || '').trim().toLowerCase(),
);
