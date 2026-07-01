import { Text, View } from 'react-native';
import { BottomSheet } from '../ui/bottom-sheet';
import { Button } from '../ui/button';

interface ConfirmSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
}

export function ConfirmSheet({
  open, onClose, title, message, confirmLabel = 'Confirm', danger = false, busy = false, onConfirm,
}: ConfirmSheetProps) {
  return (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <View className="gap-4 pb-2">
        <Text className="text-base text-muted">{message}</Text>
        <View className="gap-2">
          <Button variant="primary" loading={busy} onPress={onConfirm}>
            <Text className={`text-base font-medium ${danger ? 'text-danger' : 'text-white'}`}>{confirmLabel}</Text>
          </Button>
          <Button variant="ghost" disabled={busy} onPress={onClose}>Cancel</Button>
        </View>
      </View>
    </BottomSheet>
  );
}
