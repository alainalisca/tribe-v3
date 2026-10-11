'use client';

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { niceAxisTicks } from '@/lib/tribe-os/analytics';

const BRAND_LIME = '#B2E269';
const BRAND_DARK = '#232A31';

interface WeeklyBar {
  label: string;
  value1: number;
  value2?: number;
  isPartial?: boolean;
}

export function WeeklyBarChart({
  data,
  label1,
  label2,
  color1 = BRAND_LIME,
  color2 = BRAND_DARK,
}: {
  data: WeeklyBar[];
  label1: string;
  label2?: string;
  color1?: string;
  color2?: string;
}) {
  if (data.length < 2) return null;

  const maxVal = Math.max(...data.flatMap((d) => [d.value1, d.value2 ?? 0]));
  const ticks = niceAxisTicks(maxVal);

  return (
    <div className="h-48 sm:h-56">
      <div className="flex items-center gap-4 mb-1 px-1">
        <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color1 }} />
          {label1}
        </span>
        {label2 && (
          <span className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color2 }} />
            {label2}
          </span>
        )}
      </div>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
          <CartesianGrid stroke="rgba(0,0,0,0.05)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: 'rgb(100,116,139)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'rgb(100,116,139)', fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={48}
            domain={[0, ticks[ticks.length - 1]]}
            ticks={ticks}
            tickFormatter={(v: number) =>
              v >= 1_000_000
                ? `${(v / 1_000_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} M`
                : v >= 1_000
                  ? `${(v / 1_000).toLocaleString('es-CO', { maximumFractionDigits: 1 })} mil`
                  : v.toLocaleString('es-CO')
            }
          />
          <Tooltip
            cursor={{ fill: 'rgba(178,226,105,0.1)' }}
            contentStyle={{
              background: '#fff',
              border: '1px solid rgba(100,116,139,0.2)',
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(value, name) => [
              Number(value ?? 0).toLocaleString('es-CO'),
              String(name) === 'value1' ? label1 : (label2 ?? String(name)),
            ]}
          />
          <Bar dataKey="value1" radius={[3, 3, 0, 0]} name="value1">
            {data.map((entry, i) => (
              <Cell key={i} fill={color1} fillOpacity={entry.isPartial ? 0.45 : 1} />
            ))}
          </Bar>
          {label2 && (
            <Bar dataKey="value2" radius={[3, 3, 0, 0]} name="value2">
              {data.map((entry, i) => (
                <Cell key={i} fill={color2} fillOpacity={entry.isPartial ? 0.45 : 1} />
              ))}
            </Bar>
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
