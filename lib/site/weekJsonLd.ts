import { ACTIVE_CITY } from '@/lib/city-config';
import { sessionEventJsonLd } from '@/lib/seo/jsonLd';
import { rowTitle } from './weekBoard';
import type { WeekRow } from './weekTypes';

/**
 * T-SITE1 Part B. "La semana" as structured data: an ItemList of Events, one per
 * row, each the series' next occurrence. Built with the same Event builder as
 * the share page (lib/seo/jsonLd), fed only the board's public fields: the
 * place is the gym or neighbourhood, never a street address. Null when no row
 * makes a valid Event, so an empty board emits nothing.
 */
export function weekBoardJsonLd(
  rows: readonly WeekRow[],
  lang: 'es' | 'en',
  siteUrl: string
): Record<string, unknown> | null {
  const base = siteUrl.replace(/\/+$/, '');
  const items = rows
    .map((r) =>
      sessionEventJsonLd({
        url: `${base}/session/${r.id}/`,
        title: rowTitle(r, lang),
        sport: r.sport,
        description: null,
        date: r.date,
        start_time: r.startTime,
        end_time: null,
        // The row omits a place that is only the city; an Event still needs one.
        location: r.place ?? ACTIVE_CITY.name,
        price_cents: r.price?.cents ?? null,
        currency: r.price?.currency ?? null,
        status: 'active',
        creator_name: r.creatorName,
        image: null,
      })
    )
    .filter((e): e is Record<string, unknown> => e !== null)
    .map((event, i) => {
      // Each Event inherits the list's @context.
      const item = { ...event };
      delete item['@context'];
      return { '@type': 'ListItem', position: i + 1, item };
    });
  if (items.length === 0) return null;
  return { '@context': 'https://schema.org', '@type': 'ItemList', itemListElement: items };
}
