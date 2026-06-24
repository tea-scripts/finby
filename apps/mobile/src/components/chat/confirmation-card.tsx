import { Text, View } from 'react-native';
import type { PendingConfirmation } from '@finby/shared';
import { Button } from '../ui/button';

/** A low-confidence draft awaiting confirmation. The backend resolves these
 *  conversationally, so the buttons just send a natural-language reply. */
export function ConfirmationCard({
  confirmation,
  disabled,
  onRespond,
}: {
  confirmation: PendingConfirmation;
  disabled: boolean;
  onRespond: (reply: string) => void;
}) {
  return (
    <View className="mt-2 max-w-[85%] self-start rounded-xl border border-warn/40 bg-warn/10 p-3.5">
      <Text className="text-sm text-ink">{confirmation.question}</Text>
      <View className="mt-3 flex-row gap-2">
        <Button disabled={disabled} onPress={() => onRespond('Yes, that’s correct.')}>
          Yes, that’s right
        </Button>
        <Button variant="ghost" disabled={disabled} onPress={() => onRespond('No, that’s not right.')}>
          No
        </Button>
      </View>
    </View>
  );
}
