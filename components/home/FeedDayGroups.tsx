'use client';

import { Fragment } from 'react';
import { groupTitle, type FeedGroup, type FeedItem, type FeedSessionLike } from '@/lib/feed/feedGroups';
import { useTranslations } from '@/lib/i18n/useTranslations';

const DATE_LOCALE: Record<'es' | 'en', string> = { es: 'es-CO', en: 'en-US' };

/**
 * T-UI-FD1: the feed under its day headers ("Hoy · dom 19 oct · 3 sesiones").
 * Cards are drawn by the caller (renderCard gets the running index, for
 * eager loading of the first ones). `between[i]` renders after group i: the
 * feed's discovery modules sit between days, never between two cards; any
 * left over follow the last day.
 */
export default function FeedDayGroups<S extends FeedSessionLike>({
  groups,
  language,
  renderCard,
  between = [],
}: {
  groups: FeedGroup<S>[];
  language: 'es' | 'en';
  renderCard: (item: FeedItem<S>, index: number) => React.ReactNode;
  between?: React.ReactNode[];
}) {
  const t = useTranslations('feed');
  let index = 0;
  return (
    <div className="space-y-6" data-testid="feed-day-groups">
      {groups.map((group, g) => {
        const count = group.items.length;
        const date =
          group.date &&
          new Date(`${group.date}T00:00:00`).toLocaleDateString(DATE_LOCALE[language], {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          });
        return (
          <Fragment key={`${group.key}-${group.date ?? 'later'}`}>
            <section aria-label={groupTitle(group, language)} className="space-y-3">
              <h2 className="flex items-baseline gap-2">
                <span className="text-[17px] font-extrabold text-theme-primary">{groupTitle(group, language)}</span>
                {date && group.key !== 'weekday' && <span className="text-sm text-theme-secondary">{date}</span>}
                <span className="ml-auto text-xs text-theme-tertiary">
                  {count === 1 ? t('sessionsCountOne') : t('sessionsCount', { count })}
                </span>
              </h2>
              {group.items.map((item) => (
                <Fragment key={item.session.id}>{renderCard(item, index++)}</Fragment>
              ))}
            </section>
            {between[g] ?? null}
          </Fragment>
        );
      })}
      {/* More modules than gaps: the rest follow the last day, in order. */}
      {between.slice(groups.length).map((node, i) => (
        <Fragment key={`after-${i}`}>{node}</Fragment>
      ))}
    </div>
  );
}
