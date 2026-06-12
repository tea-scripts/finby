'use client';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TimeSeriesPoint } from '@finby/shared';

export function MetricChart({ title, data }: { title: string; data: TimeSeriesPoint[] }) {
  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="mb-2 text-sm font-medium text-neutral-700">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <XAxis dataKey="date" fontSize={11} />
          <YAxis fontSize={11} allowDecimals={false} />
          <Tooltip />
          <Area type="monotone" dataKey="value" stroke="#171717" fill="#e5e5e5" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
