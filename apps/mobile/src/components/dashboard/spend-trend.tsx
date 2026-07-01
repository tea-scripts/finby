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
  const values = data.trend.map((p) => Number(p.expenses));
  const g = trendGeometry(values, { width: W, height: H, padding: PAD });
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
      <View>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
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
      <View className="flex-row justify-between px-1">
        {data.trend.map((p, i) => (
          <Text
            key={p.month}
            className={`text-[11px] ${i === selectedIndex ? 'text-accent' : 'text-muted'}`}
          >
            {label(p.month)}
          </Text>
        ))}
      </View>
    </View>
  );
}
