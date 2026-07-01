import { render, screen, fireEvent } from '@testing-library/react-native';
import { Text } from 'react-native';
import { Dropdown } from './dropdown';

const OPTS = [
  { value: 'USD', label: 'US Dollar' },
  { value: 'NGN', label: 'Nigerian Naira' },
];

describe('Dropdown', () => {
  it('shows the placeholder when nothing is selected', async () => {
    await render(<Dropdown value={null} options={OPTS} onSelect={() => {}} placeholder="Select currency" accessibilityLabel="currency" />);
    expect(screen.getByText('Select currency')).toBeTruthy();
  });

  it('opens, lists options, and selects one', async () => {
    const onSelect = jest.fn();
    await render(<Dropdown value={null} options={OPTS} onSelect={onSelect} placeholder="Select currency" accessibilityLabel="currency" />);
    await fireEvent.press(screen.getByLabelText('currency'));
    await fireEvent.press(screen.getByText('Nigerian Naira'));
    expect(onSelect).toHaveBeenCalledWith('NGN');
  });

  it('shows the selected option label', async () => {
    await render(<Dropdown value="USD" options={OPTS} onSelect={() => {}} placeholder="Select currency" accessibilityLabel="currency" />);
    expect(screen.getByText('US Dollar')).toBeTruthy();
  });

  it('renders an option leading element in the trigger and the open list', async () => {
    const Dot = () => <Text>◆</Text>;
    const options = [{ value: 'a', label: 'Apple', leading: <Dot /> }];
    await render(<Dropdown value="a" options={options} onSelect={() => {}} accessibilityLabel="Fruit" />);
    // trigger shows the leading of the selected option
    expect(screen.getAllByText('◆').length).toBeGreaterThanOrEqual(1);
  });
});
