import { useEffect, useState } from 'react';
import { Keyboard, Platform } from 'react-native';

/** Tracks whether the software keyboard is currently shown. Used by the chat
 *  screen to drop the floating tab-bar's bottom padding while the keyboard is
 *  up — otherwise that clearance stacks on top of the keyboard as a dead gap. */
export function useKeyboardVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    // iOS fires the "will" events ahead of the animation (snappier); Android
    // only reliably reports the "did" events.
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, () => setVisible(true));
    const hide = Keyboard.addListener(hideEvent, () => setVisible(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return visible;
}
