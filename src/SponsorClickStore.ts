/**
 * 文件说明: 核验合作商家的有效展示与真实链接，并幂等保存逐次点击。
 */
import { getPool } from './store.js';
import { getSponsorListId } from './sponsor-provider.js';
import { sponsorClickTarget, type SponsorClickEvent } from './sponsor-click.js';

type LinkConfig = { url?: Record<string, unknown> };
export class SponsorClickStore {
  async record(events: SponsorClickEvent[]): Promise<{ recorded: boolean }> {
    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      let recorded = false;
      for (const event of [...events].sort((a, b) => a.eventId.localeCompare(b.eventId))) {
        const listId = getSponsorListId({ placement: event.placement, pageType: event.pageType });
        if (!listId) continue;
        const sponsor = await client.query<{ url: Record<string, unknown>; links: LinkConfig[] }>(
          `SELECT url, links FROM public_sponsor_placements WHERE list_id=$1 AND id=$2`, [listId, event.sponsorId]);
        const row = sponsor.rows[0];
        if (!row) continue;
        const urls = event.linkKind === 'main' ? Object.values(row.url)
          : row.links.flatMap(link => Object.values(link.url ?? {}));
        if (!urls.some(url => sponsorClickTarget(url) === event.targetUrl)) continue;
        const result = await client.query(`INSERT INTO sponsor_click_events
          (event_id, occurred_at, visitor_id, sponsor_id, placement, source_page, page_type, target_url, link_kind, list_id)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (event_id) DO NOTHING RETURNING event_id`, [
          event.eventId, event.occurredAt, event.visitorId, event.sponsorId, event.placement,
          event.sourcePage, event.pageType, event.targetUrl, event.linkKind, listId,
        ]);
        recorded ||= !!result.rowCount;
      }
      await client.query('COMMIT');
      return { recorded };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
}
