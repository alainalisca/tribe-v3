'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const BRAND_LIME = '#B2E269';
const BRAND_DARK = '#232A31';

interface WeeklyBar {
  label: string;
  value1: number;
  value2?: number;
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
  return (
    <div className="h-48 sm:h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 4, left: -16 }}>
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
            width={40}
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
              Number(value ?? 0),
              String(name) === 'value1' ? label1 : (label2 ?? String(name)),
            ]}
          />
          <Bar dataKey="value1" fill={color1} radius={[3, 3, 0, 0]} name="value1" />
          {label2 && <Bar dataKey="value2" fill={color2} radius={[3, 3, 0, 0]} name="value2" />}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
