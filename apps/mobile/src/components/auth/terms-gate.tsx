import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { Toggle } from '../ui/toggle';
import { TermsModal } from './terms-modal';

// NOTE: confirm the production privacy URL/domain before launch.
const PRIVACY_URL = 'https://finby.app/privacy';

export function TermsGate({
  accepted,
  onAcceptedChange,
}: {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [read, setRead] = useState(false);

  function handleToggle(next: boolean) {
    if (!read) {
      setOpen(true);
      return;
    }
    onAcceptedChange(next);
  }

  return (
    <View className="gap-2">
      <View className="flex-row items-center gap-3">
        <Toggle value={accepted} onValueChange={handleToggle} accessibilityLabel="Accept terms" />
        <Text className="flex-1 text-sm text-muted">
          I agree to the{' '}
          <Text className="font-medium text-accent" onPress={() => setOpen(true)}>
            Terms of Service
          </Text>{' '}
          and{' '}
          <Text className="font-medium text-accent" onPress={() => Linking.openURL(PRIVACY_URL)}>
            Privacy Policy
          </Text>
          .
        </Text>
      </View>
      {!read && (
        <Text className="text-xs text-faint">
          Open the Terms and scroll to the end to continue.
        </Text>
      )}
      <TermsModal
        visible={open}
        read={read}
        onRead={() => setRead(true)}
        onClose={() => setOpen(false)}
      />
    </View>
  );
}
