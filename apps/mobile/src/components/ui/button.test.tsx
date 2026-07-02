import { render, screen, fireEvent } from '@testing-library/react-native';
import { Button } from './button';

describe('Button', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress}>Sign in</Button>);
    fireEvent.press(screen.getByText('Sign in'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress} disabled>Sign in</Button>);
    fireEvent.press(screen.getByText('Sign in'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('does not fire onPress and is busy when loading', async () => {
    const onPress = jest.fn();
    await render(<Button onPress={onPress} loading testID="btn">Sign in</Button>);
    fireEvent.press(screen.getByTestId('btn'));
    expect(onPress).not.toHaveBeenCalled();
    expect(screen.getByTestId('btn').props.accessibilityState.busy).toBe(true);
    // Spinner renders (as a centered overlay) and the label stays mounted for sizing.
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('danger variant uses the danger background, white label, and a spinner while loading', async () => {
    const onPress = jest.fn();
    await render(<Button variant="danger" onPress={onPress} loading testID="del">Delete</Button>);
    expect(screen.getByTestId('del').props.className).toContain('bg-danger');
    expect(screen.getByText('Delete').props.className).toContain('text-white');
    expect(screen.getByTestId('button-spinner')).toBeTruthy();
    expect(screen.getByTestId('del').props.accessibilityState.busy).toBe(true);
  });

  it('link variant is text-only (no min-height chrome), accent-colored, and fires onPress', async () => {
    const onPress = jest.fn();
    await render(<Button variant="link" onPress={onPress} testID="lnk">Copy</Button>);
    expect(screen.getByTestId('lnk').props.className).not.toContain('min-h-12');
    expect(screen.getByText('Copy').props.className).toContain('text-accent');
    fireEvent.press(screen.getByText('Copy'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
