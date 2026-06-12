'use client';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TimeSeriesPoint } from '@finby/shared';

export function MetricChart({ title, data }: { title: string; data: TimeSeriesPoint[] }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 text-sm font-medium text-muted">{title}</div>
      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(29,110,245,0.35)" />
              <stop offset="100%" stopColor="rgba(29,110,245,0)" />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#1c2c46" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: '#5b6f8c', fontSize: 11 }}
            stroke="#1c2c46"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fill: '#5b6f8c', fontSize: 11 }}
            stroke="#1c2c46"
          />
          <Tooltip
            contentStyle={{
              background: '#0b1626',
              border: '1px solid #1c2c46',
              borderRadius: 8,
              color: '#e8eef7',
            }}
            labelStyle={{ color: '#8da3c0' }}
            cursor={{ stroke: '#1c2c46' }}
          />
          <Area type="monotone" dataKey="value" stroke="#1d6ef5" fill="url(#metricFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
