import { Keyboard } from 'react-native';
import { renderHook, act } from '@testing-library/react-native';
import { useKeyboardVisible } from './use-keyboard-visible';

describe('useKeyboardVisible', () => {
  it('is false initially and tracks show/hide events', async () => {
    const listeners: Record<string, (...args: unknown[]) => void> = {};
    const spy = jest
      .spyOn(Keyboard, 'addListener')
      .mockImplementation(((evt: string, cb: (...args: unknown[]) => void) => {
        listeners[evt] = cb;
        return { remove: jest.fn() };
      }) as unknown as typeof Keyboard.addListener);

    const { result } = await renderHook(() => useKeyboardVisible());
    expect(result.current).toBe(false);

    await act(async () => listeners.keyboardWillShow?.());
    expect(result.current).toBe(true);

    await act(async () => listeners.keyboardWillHide?.());
    expect(result.current).toBe(false);

    spy.mockRestore();
  });

  it('removes its listeners on unmount', async () => {
    const remove = jest.fn();
    const spy = jest
      .spyOn(Keyboard, 'addListener')
      .mockReturnValue({ remove } as unknown as ReturnType<typeof Keyboard.addListener>);

    const { unmount } = await renderHook(() => useKeyboardVisible());
    await act(async () => {
      unmount();
    });
    expect(remove).toHaveBeenCalledTimes(2);

    spy.mockRestore();
  });
});
