import { render, screen, fireEvent } from '@testing-library/react-native';
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
import { ConfirmSheet } from './confirm-sheet';

describe('ConfirmSheet', () => {
  it('calls onConfirm when the confirm button is pressed', async () => {
    const onConfirm = jest.fn();
    await render(
      <ConfirmSheet open onClose={jest.fn()} title="Change base currency"
        message="This recalculates everything." confirmLabel="Confirm change" onConfirm={onConfirm} />,
    );
    fireEvent.press(screen.getByText('Confirm change'));
    expect(onConfirm).toHaveBeenCalled();
  });

  it('renders a danger-styled confirm button when danger is set', async () => {
    const onConfirm = jest.fn();
    await render(
      <ConfirmSheet open onClose={jest.fn()} title="Remove member"
        message="Remove them from this family?" confirmLabel="Remove" danger onConfirm={onConfirm} />,
    );
    const label = screen.getByText('Remove');
    fireEvent.press(label);
    expect(onConfirm).toHaveBeenCalled();
    // The confirm label is plain white text on the danger button (no text-danger hack).
    expect(label.props.className).toContain('text-white');
    expect(label.props.className).not.toContain('text-danger');
  });
});
