import * as Haptics from 'expo-haptics';

/** A success haptic for celebratory moments (achievement unlocks). Best-effort:
 *  haptics aren't available on every device/simulator, so failures are swallowed. */
export function celebrateHaptic(): void {
  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
