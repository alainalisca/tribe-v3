'use client';

interface Props {
  language: string;
  period: '7d' | '30d' | '90d';
}

/** Simple CSS bar chart for bookings by day. Uses placeholder data until real analytics are wired. */
export default function PartnerBookingsChart({ language, period }: Props) {
  const t = (en: string, es: string) => (language === 'es' ? es : en);

  // Placeholder data — in production this would come from a DAL query
  const days = period === '7d' ? 7 : period === '30d' ? 14 : 21;
  const data = Array.from({ length: days }, (_, i) => ({
    label: `D${i + 1}`,
    value: Math.floor(Math.random() * 8) + 1,
  }));
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="bg-white dark:bg-tribe-surface rounded-2xl border border-stone-200 dark:border-tribe-mid p-4 mb-5">
      <h3 className="text-sm font-bold text-stone-900 dark:text-white mb-3">
        {t('Bookings by Day', 'Reservas por Día')}
      </h3>
      <div className="flex items-end gap-1 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
            <div
              className="w-full bg-tribe-green rounded-t transition-all min-h-[4px]"
              style={{ height: `${(d.value / maxVal) * 100}%` }}
            />
            {days <= 14 && <span className="text-[9px] text-stone-400 dark:text-tribe-gray-60 mt-1">{d.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
