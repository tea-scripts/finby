import { Linking, Text, View } from 'react-native';
import { Toggle } from '../ui/toggle';

// NOTE: confirm these URLs against apps/web/src/components/auth/terms-gate.tsx
// during review and align if web links elsewhere.
const TERMS_URL = 'https://finby.app/terms';
const PRIVACY_URL = 'https://finby.app/privacy';

export function TermsGate({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  return (
    <View className="flex-row items-center gap-3">
      <Toggle value={accepted} onValueChange={onAcceptedChange} accessibilityLabel="Accept terms" />
      <Text className="flex-1 text-sm text-muted">
        I agree to the{' '}
        <Text className="font-medium text-accent" onPress={() => Linking.openURL(TERMS_URL)}>
          Terms
        </Text>{' '}
        and{' '}
        <Text className="font-medium text-accent" onPress={() => Linking.openURL(PRIVACY_URL)}>
          Privacy Policy
        </Text>
        .
      </Text>
    </View>
  );
}
