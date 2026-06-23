import { Text, View } from 'react-native';
import { passwordStrength } from '@finby/shared';

const BAR_COLOR = ['', 'bg-danger', 'bg-warn', 'bg-success'] as const;

export function PasswordStrengthMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password);
  if (score === 0) return null;
  return (
    <View className="mt-1.5 gap-1" accessibilityLabel={`Password strength: ${label}`}>
      <View className="h-1 flex-row gap-1">
        {[1, 2, 3].map((i) => (
          <View key={i} className={`h-1 flex-1 rounded-full ${i <= score ? BAR_COLOR[score] : 'bg-line'}`} />
        ))}
      </View>
      <Text className="text-xs text-faint">{label}</Text>
    </View>
  );
}
