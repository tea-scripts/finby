import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { money } from '@finby/core';
import type { TrendResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';
import { trendGeometry } from '../charts/trend-geometry';

const W = 320;
const H = 120;
const PAD = 16;
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function label(month: string): string {
  const idx = Number(month.slice(5, 7)) - 1;
  return MONTH_ABBR[idx] ?? month;
}

export function SpendTrend({ state, onRetry }: SectionProps<TrendResult>) {
  return (
    <SectionCard title="Spending trend">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.trend.length < 2 ? (
        <SectionEmpty message="Not enough history yet." />
      ) : (
        <Content data={state.data} />
      )}
    </SectionCard>
  );
}

function Content({ data }: { data: TrendResult }) {
  // Measure the real width so the SVG viewBox matches it 1:1. With a fixed
  // viewBox + width="100%", preserveAspectRatio rendered the chart at its native
  // size and centered it, so the points drifted away from the full-width labels
  // (aligned only at the middle). At scale 1 the mapping is exact everywhere.
  const [chartW, setChartW] = useState(W);
  const values = data.trend.map((p) => Number(p.expenses));
  const g = trendGeometry(values, { width: chartW, height: H, padding: PAD });
  // null = show the latest month; tapping a column selects it, tapping it again resets.
  const [active, setActive] = useState<number | null>(null);
  const selectedIndex = active ?? data.trend.length - 1;
  const selected = data.trend[selectedIndex];
  const selPoint = g.points[selectedIndex];

  return (
    <View className="gap-2">
      {selected ? (
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-base font-semibold text-ink">
            {money(selected.expenses, data.currency)}
          </Text>
          <Text className="text-xs text-muted">spent in {label(selected.month)}</Text>
        </View>
      ) : null}
      <View onLayout={(e) => setChartW(e.nativeEvent.layout.width)}>
        <Svg width={chartW} height={H} viewBox={`0 0 ${chartW} ${H}`}>
          <Defs>
            <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#1d6ef5" stopOpacity={0.28} />
              <Stop offset="1" stopColor="#1d6ef5" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Path d={g.area} fill="url(#trendFill)" />
          <Path d={g.line} stroke="#1d6ef5" strokeWidth={2.5} fill="none" />
          {selPoint ? (
            <Line
              x1={selPoint.x}
              y1={PAD}
              x2={selPoint.x}
              y2={H - PAD}
              stroke="#1d6ef5"
              strokeWidth={1}
              strokeOpacity={0.35}
              strokeDasharray="3 3"
            />
          ) : null}
          {g.points.map((pt, i) => (
            <Circle
              key={data.trend[i]?.month ?? i}
              cx={pt.x}
              cy={pt.y}
              r={i === selectedIndex ? 4.5 : 2}
              fill="#1d6ef5"
              opacity={i === selectedIndex ? 1 : 0.4}
            />
          ))}
        </Svg>
        {/* Transparent tap columns over the chart — one per month (nearest-point selection). */}
        <View className="absolute inset-0 flex-row">
          {data.trend.map((p, i) => (
            <Pressable
              key={p.month}
              className="flex-1"
              accessibilityRole="button"
              accessibilityLabel={`${label(p.month)} ${p.month.slice(0, 4)}, ${money(p.expenses, data.currency)} spent`}
              onPress={() => setActive((cur) => (cur === i ? null : i))}
            />
          ))}
        </View>
      </View>
      {/* Labels sit centered under their data points (which are inset by PAD),
          not spread edge-to-edge — otherwise each month drifts off its own dot. */}
      <View className="h-4">
        {data.trend.map((p, i) => {
          const boxPct = 100 / data.trend.length;
          const centerPct = ((g.points[i]?.x ?? 0) / chartW) * 100;
          return (
            <Text
              key={p.month}
              style={{ position: 'absolute', left: `${centerPct - boxPct / 2}%`, width: `${boxPct}%`, textAlign: 'center' }}
              className={`text-[11px] ${i === selectedIndex ? 'text-accent' : 'text-muted'}`}
            >
              {label(p.month)}
            </Text>
          );
        })}
      </View>
    </View>
  );
}
