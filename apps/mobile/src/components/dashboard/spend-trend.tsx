import { Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { money } from '@finby/core';
import type { TrendResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';
import { trendGeometry } from '../charts/trend-geometry';

const W = 320;
const H = 120;
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
  const g = trendGeometry(values, { width: W, height: H, padding: 16 });
  const last = g.points[g.points.length - 1];
  const lastPoint = data.trend[data.trend.length - 1];
  return (
    <View className="gap-2">
      {lastPoint ? (
        <View className="flex-row items-baseline gap-1.5">
          <Text className="text-base font-semibold text-ink">
            {money(lastPoint.expenses, data.currency)}
          </Text>
          <Text className="text-xs text-muted">spent in {label(lastPoint.month)}</Text>
        </View>
      ) : null}
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <Defs>
          <LinearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#1d6ef5" stopOpacity={0.28} />
            <Stop offset="1" stopColor="#1d6ef5" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path d={g.area} fill="url(#trendFill)" />
        <Path d={g.line} stroke="#1d6ef5" strokeWidth={2.5} fill="none" />
        {last ? <Circle cx={last.x} cy={last.y} r={4} fill="#1d6ef5" /> : null}
      </Svg>
      <View className="flex-row justify-between px-1">
        {data.trend.map((p, i) => (
          <Text
            key={p.month}
            className={`text-[11px] ${i === data.trend.length - 1 ? 'text-accent' : 'text-muted'}`}
          >
            {label(p.month)}
          </Text>
        ))}
      </View>
    </View>
  );
}
