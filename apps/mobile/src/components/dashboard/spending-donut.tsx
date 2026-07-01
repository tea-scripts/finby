import { Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { money } from '@finby/core';
import { resolveCategoryVisual, type CategoryBreakdownResult } from '@finby/shared';
import { SectionCard, SectionLoading, SectionError, SectionEmpty, type SectionProps } from './section-card';
import { CategoryAvatar } from '../category/category-avatar';
import { donutSegments } from '../charts/donut-geometry';

const SIZE = 132;
const STROKE = 18;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

export function SpendingDonut({ state, onRetry }: SectionProps<CategoryBreakdownResult>) {
  return (
    <SectionCard title="Spending">
      {state.loading ? (
        <SectionLoading />
      ) : state.error || !state.data ? (
        <SectionError onRetry={onRetry} />
      ) : state.data.breakdown.length === 0 ? (
        <SectionEmpty message="No spending this month." />
      ) : (
        <Content data={state.data} />
      )}
    </SectionCard>
  );
}

function Content({ data }: { data: CategoryBreakdownResult }) {
  const values = data.breakdown.map((b) => Number(b.total));
  const total = values.reduce((a, v) => a + v, 0);
  const segments = donutSegments(values, C);
  return (
    <View className="flex-row items-center gap-4">
      <View style={{ width: SIZE, height: SIZE }}>
        <Svg width={SIZE} height={SIZE}>
          <G rotation={-90} originX={SIZE / 2} originY={SIZE / 2}>
            <Circle cx={SIZE / 2} cy={SIZE / 2} r={R} stroke="#16233a" strokeWidth={STROKE} fill="none" />
            {data.breakdown.map((b, i) => {
              const seg = segments[i];
              if (!seg || seg.length <= 0) return null;
              const color = resolveCategoryVisual(b.category).color;
              return (
                <Circle
                  key={b.category.id}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={R}
                  stroke={color}
                  strokeWidth={STROKE}
                  fill="none"
                  strokeDasharray={`${seg.length} ${C - seg.length}`}
                  strokeDashoffset={-seg.offset}
                />
              );
            })}
          </G>
        </Svg>
        <View className="absolute inset-0 items-center justify-center">
          <Text className="text-[11px] text-muted">Spent</Text>
          <Text className="text-base font-semibold text-ink">{money(String(total), data.currency)}</Text>
        </View>
      </View>
      <View className="min-w-0 flex-1 gap-2">
        {data.breakdown.slice(0, 4).map((b) => (
          <View key={b.category.id} className="flex-row items-center gap-2">
            <CategoryAvatar category={b.category} size="sm" />
            <Text className="min-w-0 flex-1 text-sm text-ink" numberOfLines={1}>{b.category.name}</Text>
            <Text className="text-sm text-muted">{money(b.total, data.currency)}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
